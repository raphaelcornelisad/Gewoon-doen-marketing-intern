import "server-only";
import { env } from "../env";
import { db } from "../supabase/server";
import { normPhone, vulTemplate } from "./core";
import { beoordeelKanaal, isAfmelding, type KanaalBeslissing } from "./kanaal";
import { actor, check, CrmError, getContact, log, magOutbound, OPP_COLS, zetFase, type Contact, type CrmUser, type Opp } from "./server";
import { TwilioFout, twilioStatus, verstuurBericht } from "./twilio";

export interface Template {
  id: string;
  naam: string;
  kanaal: "whatsapp" | "sms";
  doel: string;
  tekst: string;
  provider_template_id: string | null;
  categorie: string;
  actief: boolean;
}

export async function templates(doel?: string): Promise<Template[]> {
  let q = db().from("crm_templates").select("*").eq("actief", true);
  if (doel) q = q.eq("doel", doel);
  return (check(await q.order("naam")) ?? []) as Template[];
}

const voornaam = (n: string | null) => n?.trim().split(/\s+/)[0] ?? "";

export function variabelen(c: Contact, setterNaam: string | null) {
  return { voornaam: voornaam(c.contactpersoon), salon: c.salon_naam, setter: setterNaam ?? "Gewoon Doen Marketing", stad: c.stad ?? "" };
}

async function magBerichten(c: Contact, user: CrmUser) {
  if (user.rol === "admin" || magOutbound(c, user)) return;
  const sales = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", c.id).eq("pijplijn", "sales").maybeSingle()) as Opp | null;
  if (user.rol === "sales" && sales?.verkoper_id === user.setter.id) return;
  throw new CrmError("Deze lead is van een andere setter.", 403);
}

/** Server-side kanaalcontrole voor een lead. */
export async function controleerKanaal(contact: Contact, kanaal: "whatsapp" | "sms", templateId?: string | null): Promise<KanaalBeslissing> {
  const [t, inkomend, tpl] = await Promise.all([
    db().from("crm_consents").select("status, categorie").eq("contact_id", contact.id).eq("kanaal", kanaal).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("crm_messages").select("created_at").eq("contact_id", contact.id).eq("kanaal", kanaal).eq("richting", "in").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    templateId ? db().from("crm_templates").select("provider_template_id").eq("id", templateId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const st = twilioStatus();
  return beoordeelKanaal({
    kanaal,
    providerAan: kanaal === "whatsapp" ? st.whatsapp : st.sms,
    nietBenaderen: contact.niet_benaderen,
    heeftTelefoon: !!contact.telefoon_norm,
    toestemming: (check(t) as { status: "gegeven" | "ingetrokken"; categorie: string } | null) ?? null,
    laatsteInkomend: (check(inkomend) as { created_at: string } | null)?.created_at ?? null,
    templateGoedgekeurd: !!(check(tpl) as { provider_template_id: string | null } | null)?.provider_template_id,
  });
}

/** Versturen via het CRM (Twilio). Een mislukte verzending wordt als "mislukt" vastgelegd, nooit als verzonden. */
export async function verstuur(user: CrmUser, contactId: string, kanaal: "whatsapp" | "sms", tekst: string, templateId: string | null) {
  const c = await getContact(contactId);
  await magBerichten(c, user);
  const b = await controleerKanaal(c, kanaal, templateId);
  if (!b.api.ok) throw new CrmError(b.api.reden ?? "Dit kanaal kan nu niet gebruikt worden.");
  const tpl = templateId ? (check(await db().from("crm_templates").select("*").eq("id", templateId).maybeSingle()) as Template | null) : null;
  const vars = variabelen(c, user.setter?.naam ?? null);
  const inhoud = b.api.modus === "template" ? vulTemplate(tpl!.tekst, vars) : tekst.trim();
  if (!inhoud) throw new CrmError("Leeg bericht.");
  const msg = check(
    await db()
      .from("crm_messages")
      .insert({ contact_id: c.id, kanaal, richting: "uit", tekst: inhoud, template_id: tpl?.id ?? null, status: "wachtrij", door: user.email, setter_id: user.setter?.id ?? null })
      .select("id")
      .single(),
  ) as { id: string };
  try {
    const r = await verstuurBericht({
      kanaal,
      aan: c.telefoon_norm!,
      ...(b.api.modus === "template" ? { contentSid: tpl!.provider_template_id!, variabelen: { "1": vars.voornaam, "2": vars.salon, "3": vars.setter } } : { tekst: inhoud }),
      statusCallback: `${env("APP_URL").replace(/\/$/, "")}/api/twilio/bericht-status`,
    });
    check(await db().from("crm_messages").update({ provider_sid: r.sid, status: r.status === "queued" || r.status === "accepted" ? "wachtrij" : "verzonden", updated_at: new Date().toISOString() }).eq("id", msg.id));
  } catch (e) {
    const fout = e instanceof TwilioFout ? e.message : "Verzenden mislukt.";
    check(await db().from("crm_messages").update({ status: "mislukt", fout, updated_at: new Date().toISOString() }).eq("id", msg.id));
    throw new CrmError(fout, 502);
  }
  await log({ contact_id: c.id, ...actor(user), type: "bericht", tekst: `${kanaal === "whatsapp" ? "WhatsApp" : "Sms"} aangeboden aan provider` });
}

/** Handmatig verstuurd via de eigen WhatsApp-app: vastleggen als "handmatig", niet als verzonden/afgeleverd. */
export async function logHandmatig(user: CrmUser, contactId: string, kanaal: "whatsapp" | "sms", tekst: string) {
  const c = await getContact(contactId);
  await magBerichten(c, user);
  const b = await controleerKanaal(c, kanaal);
  if (!b.handmatig.ok) throw new CrmError(b.handmatig.reden ?? "Dit kanaal kan nu niet gebruikt worden.");
  check(await db().from("crm_messages").insert({ contact_id: c.id, kanaal, richting: "uit", tekst: tekst.trim().slice(0, 4000), status: "handmatig", door: user.email, setter_id: user.setter?.id ?? null }));
  await log({ contact_id: c.id, ...actor(user), type: "bericht", tekst: `${kanaal === "whatsapp" ? "WhatsApp" : "Sms"} handmatig geopend in eigen app (niet gecontroleerd of verzonden)` });
}

const STATUS: Record<string, string> = { queued: "wachtrij", accepted: "wachtrij", sending: "wachtrij", sent: "verzonden", delivered: "afgeleverd", read: "gelezen", failed: "mislukt", undelivered: "mislukt" };
const RANG: Record<string, number> = { wachtrij: 0, verzonden: 1, afgeleverd: 2, gelezen: 3, mislukt: 4 };

/** Statusupdate van Twilio. Status gaat alleen vooruit (een late "sent" overschrijft geen "read"). */
export async function berichtStatus(sid: string, twilioStatusNaam: string, foutCode?: string) {
  const nieuw = STATUS[twilioStatusNaam];
  if (!nieuw) return;
  const m = check(await db().from("crm_messages").select("id, status").eq("provider_sid", sid).maybeSingle()) as { id: string; status: string } | null;
  if (!m || (RANG[nieuw] ?? 0) <= (RANG[m.status] ?? 0)) return;
  check(await db().from("crm_messages").update({ status: nieuw, fout: nieuw === "mislukt" ? `Twilio-foutcode ${foutCode ?? "onbekend"}` : null, updated_at: new Date().toISOString() }).eq("id", m.id));
}

/** Inkomend bericht: koppelen aan lead, opvolging stoppen, afmelding verwerken, taak voor reactie. */
export async function inkomend(o: { sid: string; van: string; tekst: string; kanaal: "whatsapp" | "sms" }) {
  const tel = normPhone(o.van.replace(/^whatsapp:/, ""));
  const c = tel ? (check(await db().from("crm_contacts").select("id, eigenaar_id, salon_naam").eq("telefoon_norm", tel).maybeSingle()) as { id: string; eigenaar_id: string | null; salon_naam: string } | null) : null;
  if (!c) {
    console.warn("Inkomend bericht van onbekend nummer", tel);
    return;
  }
  const r = await db().from("crm_messages").insert({ contact_id: c.id, kanaal: o.kanaal, richting: "in", tekst: o.tekst.slice(0, 4000), status: "ontvangen", provider_sid: o.sid, door: "lead" });
  if (r.error) {
    if (/duplicate key/.test(r.error.message)) return; // dubbele melding
    throw new Error(r.error.message);
  }
  if (isAfmelding(o.tekst)) {
    check(await db().from("crm_consents").insert({ contact_id: c.id, kanaal: o.kanaal, status: "ingetrokken", bron: `Afmelding per ${o.kanaal}: "${o.tekst.trim().slice(0, 50)}"`, vastgelegd_door: "systeem" }));
    check(await db().from("crm_contacts").update({ niet_benaderen: true, niet_benaderen_reden: `Afgemeld via ${o.kanaal}`, volgende_opvolging_op: null }).eq("id", c.id));
    const ob = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", c.id).eq("pijplijn", "outbound").maybeSingle()) as Opp | null;
    if (ob && ob.fase !== "ingepland") await zetFase(ob, "niet_benaderen", "systeem", null, "Afgemeld per bericht");
    await log({ contact_id: c.id, door: "systeem", type: "toestemming", tekst: `Afgemeld via ${o.kanaal}; geplande opvolging gestopt` });
    return;
  }
  // Reactie: geplande opvolging stoppen en een taak voor de verantwoordelijke maken.
  check(await db().from("crm_contacts").update({ volgende_opvolging_op: null }).eq("id", c.id));
  check(await db().from("crm_tasks").insert({ contact_id: c.id, toegewezen_aan: c.eigenaar_id, titel: `Reageren op ${o.kanaal === "whatsapp" ? "WhatsApp" : "sms"} van ${c.salon_naam}`, vervalt_op: new Date().toISOString(), door: "systeem" }));
  await log({ contact_id: c.id, door: "lead", type: "bericht", tekst: `Inkomend ${o.kanaal === "whatsapp" ? "WhatsApp-bericht" : "sms"}: ${o.tekst.slice(0, 200)}` });
}

/** Inbox: gesprekken met het laatste bericht, openstaande reacties eerst. */
export async function inbox(user: CrmUser) {
  const msgs = (check(
    await db()
      .from("crm_messages")
      .select("id, contact_id, kanaal, richting, tekst, status, created_at, gelezen_door_team, contact:crm_contacts!inner(id, salon_naam, eigenaar_id)")
      .order("created_at", { ascending: false })
      .limit(1000),
  ) ?? []) as unknown as { id: string; contact_id: string; kanaal: string; richting: string; tekst: string; status: string; created_at: string; gelezen_door_team: boolean; contact: { id: string; salon_naam: string; eigenaar_id: string | null } }[];
  const zichtbaar = msgs.filter((m) => user.rol === "admin" || (user.setter && m.contact.eigenaar_id === user.setter.id));
  const perLead = new Map<string, { contact: { id: string; salon_naam: string; eigenaar_id: string | null }; laatste: (typeof zichtbaar)[number]; open: number }>();
  for (const m of zichtbaar) {
    const g = perLead.get(m.contact_id) ?? { contact: m.contact, laatste: m, open: 0 };
    if (m.richting === "in" && !m.gelezen_door_team) g.open++;
    perLead.set(m.contact_id, g);
  }
  return [...perLead.values()].sort((a, b) => b.open - a.open || b.laatste.created_at.localeCompare(a.laatste.created_at));
}

export async function markeerGelezen(user: CrmUser, contactId: string) {
  const c = await getContact(contactId);
  await magBerichten(c, user);
  check(await db().from("crm_messages").update({ gelezen_door_team: true }).eq("contact_id", contactId).eq("richting", "in").eq("gelezen_door_team", false));
}
