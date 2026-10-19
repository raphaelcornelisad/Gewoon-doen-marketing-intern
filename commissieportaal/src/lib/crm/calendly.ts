import "server-only";
import { randomBytes } from "node:crypto";
import { acqSetters } from "../acquisitie/server";
import { env } from "../env";
import { db } from "../supabase/server";
import { geldigeHandtekening } from "./calendly-sign";
import { automatischVooruit, normEmail, normPhone } from "./core";
import { herbereken } from "./grootboek";
import { provincieVoor } from "./provincies";
import { actor, check, CONTACT_COLS, CrmError, ensureSales, getContact, log, magOutbound, magSales, OPP_COLS, zetFase, type Contact, type CrmUser, type Opp } from "./server";

export type Gesprekstype = "kennismaking" | "salesgesprek";

export interface CrmSettings {
  auto_doorbellen: boolean;
  aftel_sec: number;
  reservering_min: number;
  calendly_url_kennismaking: string | null;
  calendly_url_sales: string | null;
  calendly_event_kennismaking: string;
  calendly_event_sales: string;
  calendly_webhook_uri: string | null;
  calendly_signing_key: string | null;
  utm_campaign: string;
  opnemen: boolean;
  opname_melding: string;
  bewaartermijn_dagen: number;
  commissie_grondslag: string;
  laatste_sync: string | null;
  laatste_sync_fout: string | null;
}

export async function crmSettings(): Promise<CrmSettings> {
  return check(await db().from("crm_settings").select("*").eq("id", 1).single()) as CrmSettings;
}

// ---------- Inplannen vanuit de leadkaart ----------

/**
 * Maakt een ondoorzichtige boekingsreferentie (→ lead, setter, gesprekstype) en de Calendly-link met
 * voorinvulling en UTM. Er ontstaat nog géén afspraak: die komt pas na bevestiging door Calendly.
 */
export async function maakBoekingslink(user: CrmUser, contactId: string, type: Gesprekstype) {
  const c = await getContact(contactId);
  const s = await crmSettings();
  if (c.niet_benaderen) throw new CrmError("Deze lead staat op niet meer benaderen.");
  if (type === "kennismaking" && !magOutbound(c, user)) throw new CrmError("Deze lead is van een andere setter.", 403);
  if (type === "salesgesprek") {
    const sales = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", c.id).eq("pijplijn", "sales").maybeSingle()) as Opp | null;
    if (user.rol !== "admin" && !(sales && magSales(sales, user)) && !(user.rol === "setter" && sales?.setter_id === user.setter.id)) {
      throw new CrmError("Je mag voor deze lead geen salesgesprek inplannen.", 403);
    }
  }
  const basis = type === "kennismaking" ? s.calendly_url_kennismaking : s.calendly_url_sales;
  if (!basis) throw new CrmError(`De Calendly-link voor ${type === "kennismaking" ? "het kennismakingsgesprek" : "het salesgesprek"} is nog niet ingesteld (CRM → Instellingen).`);
  const ref = randomBytes(12).toString("base64url");
  check(
    await db().from("crm_booking_refs").insert({
      ref,
      contact_id: c.id,
      setter_id: user.rol === "setter" ? user.setter.id : type === "kennismaking" ? c.eigenaar_id : null,
      gesprekstype: type,
      campagne: s.utm_campaign,
      aangemaakt_door: user.email,
    }),
  );
  const url = new URL(basis);
  const naam = c.contactpersoon || "";
  if (naam) url.searchParams.set("name", naam);
  if (c.email) url.searchParams.set("email", c.email);
  if (c.telefoon_norm) url.searchParams.set("a1", c.telefoon_norm); // eerste vraag in Calendly = telefoonnummer
  if (c.salon_naam) url.searchParams.set("a2", c.salon_naam); // tweede vraag = salon/bedrijf
  url.searchParams.set("utm_source", "gdm_crm");
  url.searchParams.set("utm_medium", "outbound_call");
  url.searchParams.set("utm_campaign", s.utm_campaign);
  url.searchParams.set("utm_content", ref);
  await log({ contact_id: c.id, ...actor(user), type: "calendly", tekst: `Boekingslink geopend (${type === "kennismaking" ? "kennismaking" : "salesgesprek"})` });
  return { ref, url: url.toString() };
}

export async function boekingStatus(user: CrmUser, ref: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(ref)) throw new CrmError("Onbekende referentie.", 404);
  const r = check(await db().from("crm_booking_refs").select("ref, contact_id, aangemaakt_door, gebruikt_op").eq("ref", ref).maybeSingle()) as {
    ref: string;
    contact_id: string;
    aangemaakt_door: string;
    gebruikt_op: string | null;
  } | null;
  if (!r || (user.rol !== "admin" && r.aangemaakt_door !== user.email)) throw new CrmError("Onbekende referentie.", 404);
  const a = check(await db().from("crm_appointments").select("id, start_op, status, type").eq("booking_ref", ref).order("created_at", { ascending: false }).limit(1).maybeSingle()) as {
    id: string;
    start_op: string;
    status: string;
    type: string;
  } | null;
  return { bevestigd: !!a, afspraak: a };
}

// ---------- Calendly API ----------

async function calendly<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.CALENDLY_TOKEN;
  if (!token) throw new CrmError("CALENDLY_TOKEN ontbreekt in Vercel; Calendly is nog niet aangesloten.", 503);
  const res = await fetch(path.startsWith("http") ? path : `https://api.calendly.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Maakt (of vervangt) het webhookabonnement met een eigen ondertekeningssleutel. */
export async function abonneerWebhook() {
  const me = await calendly<{ resource: { uri: string; current_organization: string } }>("/users/me");
  const s = await crmSettings();
  if (s.calendly_webhook_uri) await calendly(s.calendly_webhook_uri, { method: "DELETE" }).catch(() => null);
  const key = randomBytes(32).toString("base64url");
  const r = await calendly<{ resource: { uri: string } }>("/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: `${env("APP_URL").replace(/\/$/, "")}/api/webhooks/calendly`,
      events: ["invitee.created", "invitee.canceled", "invitee_no_show.created", "invitee_no_show.deleted"],
      organization: me.resource.current_organization,
      user: me.resource.uri,
      scope: "user",
      signing_key: key,
    }),
  });
  check(await db().from("crm_settings").update({ calendly_webhook_uri: r.resource.uri, calendly_signing_key: key }).eq("id", 1));
  return r.resource.uri;
}

// ---------- Webhook ----------

interface Invitee {
  uri: string;
  email?: string | null;
  name?: string | null;
  status?: "active" | "canceled";
  text_reminder_number?: string | null;
  rescheduled?: boolean;
  old_invitee?: string | null;
  new_invitee?: string | null;
  tracking?: { utm_source?: string | null; utm_content?: string | null; utm_campaign?: string | null } | null;
  questions_and_answers?: { question: string; answer: string }[] | null;
  no_show?: unknown;
  scheduled_event?: ScheduledEvent;
  event?: string;
}
interface ScheduledEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time?: string;
  status?: "active" | "canceled";
}

export async function ontvangWebhook(raw: string, header: string | null) {
  const s = await crmSettings();
  if (!s.calendly_signing_key || !geldigeHandtekening(raw, header, s.calendly_signing_key)) return { status: 401 as const };
  const body = JSON.parse(raw) as { event: string; created_at: string; payload: Record<string, unknown> };
  const p = body.payload as { uri?: string; invitee?: string };
  const sleutel = `${body.event}:${p.uri ?? p.invitee}:${body.created_at}`;
  const ins = await db().from("crm_webhook_events").insert({ bron: "calendly", sleutel, soort: body.event, payload: body }).select("id").single();
  if (ins.error) {
    if (/duplicate key/.test(ins.error.message)) return { status: 200 as const, dubbel: true };
    throw new Error(ins.error.message);
  }
  await verwerkEvent((ins.data as { id: string }).id);
  return { status: 200 as const };
}

/** Verwerkt één opgeslagen webhookmelding (ook gebruikt voor opnieuw proberen). */
export async function verwerkEvent(id: string) {
  const e = check(await db().from("crm_webhook_events").select("id, soort, payload, pogingen").eq("id", id).single()) as {
    id: string;
    soort: string;
    payload: { payload: Record<string, unknown> };
    pogingen: number;
  };
  try {
    const p = e.payload.payload;
    let r: string;
    if (e.soort === "invitee.created" || e.soort === "invitee.canceled") {
      const inv = p as unknown as Invitee;
      r = inv.status === "canceled" || e.soort === "invitee.canceled" ? await verwerkAnnulering(inv) : await verwerkBoeking(inv, inv.scheduled_event!);
    } else if (e.soort === "invitee_no_show.created" || e.soort === "invitee_no_show.deleted") {
      r = await verwerkNoShow(String((p as { invitee?: string }).invitee), e.soort === "invitee_no_show.created");
    } else r = "genegeerd";
    check(await db().from("crm_webhook_events").update({ status: r === "genegeerd" ? "genegeerd" : "verwerkt", fout: null, pogingen: e.pogingen + 1, verwerkt_op: new Date().toISOString() }).eq("id", e.id));
  } catch (err) {
    check(await db().from("crm_webhook_events").update({ status: "mislukt", fout: err instanceof Error ? err.message.slice(0, 500) : String(err), pogingen: e.pogingen + 1 }).eq("id", e.id));
    throw err;
  }
}

async function typeVan(eventNaam: string): Promise<Gesprekstype | null> {
  const s = await crmSettings();
  const n = eventNaam.trim().toLowerCase();
  if (n === s.calendly_event_kennismaking.trim().toLowerCase()) return "kennismaking";
  if (n === s.calendly_event_sales.trim().toLowerCase()) return "salesgesprek";
  return null;
}

async function zoekContact(email: string | null, tel: string | null): Promise<Contact | null> {
  if (email) {
    const c = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("email", email).maybeSingle()) as Contact | null;
    if (c) return c;
  }
  if (tel) return check(await db().from("crm_contacts").select(CONTACT_COLS).eq("telefoon_norm", tel).maybeSingle()) as Contact | null;
  return null;
}

const telVan = (inv: Invitee) => normPhone(inv.text_reminder_number || inv.questions_and_answers?.find((q) => /telefoon|phone|mobiel|nummer/i.test(q.question))?.answer);

interface Afspraak {
  id: string;
  contact_id: string;
  type: Gesprekstype;
  status: string;
  start_op: string;
  setter_id: string | null;
  attributie: string;
  booking_ref: string | null;
}

/** Nieuwe of gewijzigde boeking. Idempotent op invitee-URI. */
export async function verwerkBoeking(inv: Invitee, ev: ScheduledEvent, handmatig?: { contactId: string; setterId: string | null; door: string }): Promise<string> {
  const type = await typeVan(ev.name);
  if (!type) return "genegeerd";
  const bestaand = check(await db().from("crm_appointments").select("id, status, start_op, contact_id").eq("calendly_invitee_uri", inv.uri).maybeSingle()) as Afspraak | null;
  if (bestaand) {
    if (bestaand.status === "gepland" && new Date(bestaand.start_op).getTime() !== new Date(ev.start_time).getTime()) {
      check(await db().from("crm_appointments").update({ start_op: ev.start_time, eind_op: ev.end_time ?? null, updated_at: new Date().toISOString() }).eq("id", bestaand.id));
    }
    return "verwerkt";
  }

  const email = normEmail(inv.email);
  const tel = telVan(inv);
  const vorige = inv.old_invitee ? (check(await db().from("crm_appointments").select("*").eq("calendly_invitee_uri", inv.old_invitee).maybeSingle()) as Afspraak | null) : null;

  let contact: Contact | null = null;
  let setterId: string | null = null;
  let attributie: "referentie" | "utm_setter" | "handmatig" | "geen" = "geen";
  let ref: string | null = null;

  if (handmatig) {
    contact = await getContact(handmatig.contactId);
    setterId = handmatig.setterId;
    attributie = "handmatig";
  } else if (vorige) {
    // Verplaatsing: oorspronkelijke lead en setterattributie blijven.
    contact = await getContact(vorige.contact_id);
    setterId = vorige.setter_id;
    attributie = vorige.attributie as typeof attributie;
    ref = vorige.booking_ref;
  } else {
    const t = inv.tracking ?? {};
    if (t.utm_source === "gdm_crm" && t.utm_content) {
      // Referentie server-side controleren; nooit een setter-ID uit de URL vertrouwen.
      const r = check(await db().from("crm_booking_refs").select("ref, contact_id, setter_id").eq("ref", t.utm_content).maybeSingle()) as { ref: string; contact_id: string; setter_id: string | null } | null;
      if (r) {
        contact = await getContact(r.contact_id);
        setterId = r.setter_id;
        attributie = "referentie";
        ref = r.ref;
      }
    }
    if (!contact && t.utm_source) {
      // Oude persoonlijke setterlink (utm_source = code van de setter).
      const s = (await acqSetters()).find((x) => x.utm_source && x.utm_source.toLowerCase() === t.utm_source!.toLowerCase());
      if (s) {
        setterId = s.id;
        attributie = "utm_setter";
      }
    }
    if (!contact) contact = await zoekContact(email, tel);
    if (!contact && attributie === "utm_setter") {
      const qa = inv.questions_and_answers ?? [];
      const salon = qa.find((q) => /salon|bedrijf|kliniek|praktijk/i.test(q.question))?.answer?.trim();
      const stad = qa.find((q) => /stad|plaats|vestiging/i.test(q.question))?.answer?.trim() || null;
      contact = check(
        await db()
          .from("crm_contacts")
          .insert({ salon_naam: salon || inv.name || email || "Onbekend", contactpersoon: inv.name ?? null, email, telefoon: tel, telefoon_norm: tel, stad, provincie: provincieVoor(stad), bron: "calendly", eigenaar_id: setterId, oorspronkelijke_setter_id: setterId })
          .select(CONTACT_COLS)
          .single(),
      ) as Contact;
      check(await db().from("crm_opportunities").insert({ contact_id: contact.id, pijplijn: "outbound", fase: "nieuw" }));
    }
    if (!contact) {
      // Geen lead te vinden: ter beoordeling, niets aanmaken en geen commissie.
      const bekend = check(await db().from("crm_review").select("id").eq("soort", "boeking_zonder_lead").contains("info", { invitee_uri: inv.uri }).limit(1)) as { id: string }[];
      if (!bekend.length) {
        check(await db().from("crm_review").insert({ soort: "boeking_zonder_lead", info: { invitee_uri: inv.uri, naam: inv.name, email, telefoon: tel, type, start: ev.start_time, utm: inv.tracking ?? null, invitee: inv, event: ev } }));
      }
      return "verwerkt";
    }
  }

  const ins = await db()
    .from("crm_appointments")
    .insert({
      contact_id: contact.id,
      type,
      status: "gepland",
      start_op: ev.start_time,
      eind_op: ev.end_time ?? null,
      calendly_event_uri: ev.uri,
      calendly_invitee_uri: inv.uri,
      booking_ref: ref,
      attributie,
      setter_id: type === "kennismaking" ? setterId : (vorige?.setter_id ?? null),
      vorige_afspraak_id: vorige?.id ?? null,
    })
    .select("id")
    .single();
  if (ins.error) {
    if (/duplicate key/.test(ins.error.message)) return "verwerkt"; // gelijktijdige melding
    throw new Error(ins.error.message);
  }
  const apptId = (ins.data as { id: string }).id;
  const wanneer = new Date(ev.start_time).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const door = handmatig?.door ?? "calendly";

  if (vorige) {
    check(await db().from("crm_appointments").update({ status: "verplaatst", updated_at: new Date().toISOString() }).eq("id", vorige.id).in("status", ["gepland", "geannuleerd", "verplaatst"]));
    await log({ contact_id: contact.id, door, type: "afspraak", pijplijn: "sales", tekst: `Afspraak verplaatst naar ${wanneer}` });
  } else {
    await log({ contact_id: contact.id, door, setter_id: setterId, type: "afspraak", pijplijn: "sales", tekst: `${type === "kennismaking" ? "Kennismakingsgesprek" : "Salesgesprek"} bevestigd: ${wanneer}${attributie === "geen" ? " (geen setter-attributie, ter beoordeling)" : ""}` });
  }
  if (ref) check(await db().from("crm_booking_refs").update({ gebruikt_op: new Date().toISOString() }).eq("ref", ref).is("gebruikt_op", null));

  // Ontbrekende contactgegevens aanvullen uit de boeking (bron: Calendly).
  const aanvullen: Record<string, unknown> = {};
  if (!contact.email && email) aanvullen.email = email;
  if (!contact.telefoon_norm && tel) Object.assign(aanvullen, { telefoon: tel, telefoon_norm: tel });
  if (!contact.contactpersoon && inv.name) aanvullen.contactpersoon = inv.name;
  if (Object.keys(aanvullen).length) await db().from("crm_contacts").update(aanvullen).eq("id", contact.id); // conflict (e-mail elders) is geen ramp

  if (!vorige) {
    // Doorstromen: outbound → Ingepland, saleskaart (zelfde contact) met toegeschreven setter.
    const outbound = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", contact.id).eq("pijplijn", "outbound").maybeSingle()) as Opp | null;
    if (outbound && outbound.fase !== "ingepland") await zetFase(outbound, "ingepland", door, setterId, "Boeking bevestigd door Calendly");
    const sales = await ensureSales(contact.id, type === "kennismaking" ? setterId : null, door);
    if (type === "kennismaking" && !sales.setter_id && setterId) check(await db().from("crm_opportunities").update({ setter_id: setterId }).eq("id", sales.id));
    if (type === "salesgesprek" && automatischVooruit(sales.fase, "salesgesprek")) await zetFase(sales, "salesgesprek", door, null, "Salesgesprek geboekt");
    if (type === "kennismaking" && attributie === "geen") {
      check(await db().from("crm_review").insert({ soort: "attributie", contact_id: contact.id, appointment_id: apptId, info: { reden: "Boeking zonder boekingsreferentie; koppel handmatig een setter (of geen)." } }));
    }
    if (setterId && !contact.eigenaar_id && type === "kennismaking") {
      check(await db().from("crm_contacts").update({ eigenaar_id: setterId, oorspronkelijke_setter_id: contact.oorspronkelijke_setter_id ?? setterId }).eq("id", contact.id).is("eigenaar_id", null));
    }
  }
  return "verwerkt";
}

async function verwerkAnnulering(inv: Invitee): Promise<string> {
  const a = check(await db().from("crm_appointments").select("id, contact_id, status").eq("calendly_invitee_uri", inv.uri).maybeSingle()) as Afspraak | null;
  if (!a) return "verwerkt";
  const nieuw = inv.rescheduled ? "verplaatst" : "geannuleerd";
  if (a.status !== "gepland") return "verwerkt"; // verschenen/no-show/al verwerkt niet overschrijven
  check(await db().from("crm_appointments").update({ status: nieuw, updated_at: new Date().toISOString() }).eq("id", a.id).eq("status", "gepland"));
  if (nieuw === "geannuleerd") await log({ contact_id: a.contact_id, door: "calendly", type: "afspraak", pijplijn: "sales", tekst: "Afspraak geannuleerd in Calendly" });
  return "verwerkt";
}

async function verwerkNoShow(inviteeUri: string, isNoShow: boolean): Promise<string> {
  const a = check(await db().from("crm_appointments").select("id, contact_id, status").eq("calendly_invitee_uri", inviteeUri).maybeSingle()) as Afspraak | null;
  if (!a) return "verwerkt";
  if (isNoShow && a.status !== "no_show") {
    check(await db().from("crm_appointments").update({ status: "no_show", status_door: "calendly", updated_at: new Date().toISOString() }).eq("id", a.id));
    await log({ contact_id: a.contact_id, door: "calendly", type: "afspraak", pijplijn: "sales", tekst: "No-show gemarkeerd in Calendly" });
  } else if (!isNoShow && a.status === "no_show") {
    check(await db().from("crm_appointments").update({ status: "gepland", status_door: "calendly", updated_at: new Date().toISOString() }).eq("id", a.id));
    await log({ contact_id: a.contact_id, door: "calendly", type: "afspraak", pijplijn: "sales", tekst: "No-show ongedaan gemaakt in Calendly" });
  }
  await herbereken("calendly");
  return "verwerkt";
}

// ---------- Periodieke synchronisatie ----------

/** Herstelt gemiste meldingen: haalt afspraken van beide gesprekstypes op en verwerkt ze idempotent. */
export async function syncCalendlyCrm(dagenTerug = 30) {
  const s = await crmSettings();
  try {
    const me = await calendly<{ resource: { uri: string } }>("/users/me");
    const min = new Date(Date.now() - dagenTerug * 86400000).toISOString();
    const namen = [s.calendly_event_kennismaking, s.calendly_event_sales].map((n) => n.trim().toLowerCase());
    let next: string | null = `/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&min_start_time=${encodeURIComponent(min)}&count=100&sort=start_time:asc`;
    let n = 0;
    while (next) {
      const page: { collection: ScheduledEvent[]; pagination: { next_page: string | null } } = await calendly(next);
      for (const ev of page.collection.filter((e) => namen.includes(e.name.trim().toLowerCase()))) {
        const inv = await calendly<{ collection: Invitee[] }>(`${ev.uri}/invitees?count=100`);
        for (const i of inv.collection) {
          if (i.status === "canceled") await verwerkAnnulering(i);
          else await verwerkBoeking(i, ev);
          if (i.no_show) await verwerkNoShow(i.uri, true);
          n++;
        }
      }
      next = page.pagination.next_page;
    }
    check(await db().from("crm_settings").update({ laatste_sync: new Date().toISOString(), laatste_sync_fout: null }).eq("id", 1));
    await herbereken("calendly");
    return { invitees: n };
  } catch (e) {
    const fout = e instanceof Error ? e.message.slice(0, 500) : String(e);
    await db().from("crm_settings").update({ laatste_sync_fout: `${new Date().toISOString()}: ${fout}` }).eq("id", 1);
    throw e;
  }
}

/** Mislukte webhookmeldingen opnieuw verwerken. */
export async function herverwerkMislukt() {
  const rows = check(await db().from("crm_webhook_events").select("id").eq("status", "mislukt").lt("pogingen", 10).order("created_at").limit(50)) as { id: string }[];
  let ok = 0;
  for (const r of rows) {
    try {
      await verwerkEvent(r.id);
      ok++;
    } catch {
      /* staat als mislukt in de lijst */
    }
  }
  return { geprobeerd: rows.length, ok };
}

// ---------- Afspraakstatus en beoordeling ----------

/** Verschenen/no-show: alleen admin of de toegewezen salesmedewerker. */
export async function zetAfspraakStatus(user: CrmUser, apptId: string, status: "verschenen" | "no_show" | "gepland") {
  const a = check(await db().from("crm_appointments").select("id, contact_id, type, status").eq("id", apptId).maybeSingle()) as Afspraak | null;
  if (!a) throw new CrmError("Onbekende afspraak.", 404);
  const sales = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", a.contact_id).eq("pijplijn", "sales").maybeSingle()) as Opp | null;
  if (!(user.rol === "admin" || (sales && user.rol === "sales" && magSales(sales, user)))) throw new CrmError("Alleen de admin of de salesmedewerker registreert of iemand verschenen is.", 403);
  if (a.status === "geannuleerd" || a.status === "verplaatst") throw new CrmError("Deze afspraak is geannuleerd of verplaatst.");
  check(await db().from("crm_appointments").update({ status, status_door: user.email, updated_at: new Date().toISOString() }).eq("id", a.id));
  await log({ contact_id: a.contact_id, ...actor(user), type: "afspraak", pijplijn: "sales", van: a.status, naar: status, tekst: `${a.type === "kennismaking" ? "Kennismaking" : "Salesgesprek"}: ${status === "verschenen" ? "verschenen" : status === "no_show" ? "no-show" : "terug naar gepland"}` });
  if (status === "verschenen" && sales) {
    const doel = a.type === "kennismaking" ? "kennismaking" : "salesgesprek";
    if (automatischVooruit(sales.fase, doel)) await zetFase(sales, doel, user.email, null);
  }
  await herbereken(user.email);
}

/** Admin: setter-attributie van een kennismaking vastleggen (of bewust geen). */
export async function koppelSetter(user: CrmUser, reviewId: string, setterId: string | null) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
  const r = check(await db().from("crm_review").select("id, appointment_id, contact_id, status").eq("id", reviewId).eq("soort", "attributie").maybeSingle()) as { id: string; appointment_id: string; contact_id: string; status: string } | null;
  if (!r || r.status !== "open") throw new CrmError("Niet gevonden.", 404);
  check(await db().from("crm_appointments").update({ setter_id: setterId, attributie: setterId ? "handmatig" : "geen", updated_at: new Date().toISOString() }).eq("id", r.appointment_id));
  if (setterId) check(await db().from("crm_opportunities").update({ setter_id: setterId }).eq("contact_id", r.contact_id).eq("pijplijn", "sales").is("setter_id", null));
  check(await db().from("crm_review").update({ status: "opgelost", opgelost_door: user.email }).eq("id", r.id));
  await log({ contact_id: r.contact_id, ...actor(user), type: "attributie", naar: setterId, tekst: setterId ? "Setter handmatig toegeschreven aan kennismaking" : "Bewust geen setter toegeschreven" });
  await herbereken(user.email);
}

/** Admin: boeking zonder lead koppelen aan een bestaande lead of als nieuwe lead aanmaken. */
export async function koppelBoeking(user: CrmUser, reviewId: string, keuze: { contactId?: string; nieuw?: boolean; setterId: string | null; negeren?: boolean }) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
  const r = check(await db().from("crm_review").select("id, info, status").eq("id", reviewId).eq("soort", "boeking_zonder_lead").maybeSingle()) as {
    id: string;
    info: { invitee: Invitee; event: ScheduledEvent; naam?: string; email?: string; telefoon?: string };
    status: string;
  } | null;
  if (!r || r.status !== "open") throw new CrmError("Niet gevonden.", 404);
  if (keuze.negeren) {
    check(await db().from("crm_review").update({ status: "genegeerd", opgelost_door: user.email }).eq("id", r.id));
    return;
  }
  let contactId = keuze.contactId;
  if (keuze.nieuw) {
    const c = check(
      await db()
        .from("crm_contacts")
        .insert({ salon_naam: r.info.naam || r.info.email || "Onbekend", contactpersoon: r.info.naam ?? null, email: r.info.email ?? null, telefoon: r.info.telefoon ?? null, telefoon_norm: r.info.telefoon ?? null, bron: "calendly" })
        .select("id")
        .single(),
    ) as { id: string };
    check(await db().from("crm_opportunities").insert({ contact_id: c.id, pijplijn: "outbound", fase: "nieuw" }));
    contactId = c.id;
  }
  if (!contactId) throw new CrmError("Kies een lead.");
  await verwerkBoeking(r.info.invitee, r.info.event, { contactId, setterId: keuze.setterId, door: user.email });
  check(await db().from("crm_review").update({ status: "opgelost", opgelost_door: user.email, contact_id: contactId }).eq("id", r.id));
  await herbereken(user.email);
}

/** Admin: afspraak die buiten Calendly is gemaakt handmatig vastleggen. */
export async function handmatigeAfspraak(user: CrmUser, contactId: string, type: Gesprekstype, start: string, setterId: string | null) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
  if (Number.isNaN(Date.parse(start))) throw new CrmError("Ongeldige datum/tijd.");
  const uri = `handmatig:${randomBytes(8).toString("hex")}`;
  await verwerkBoeking({ uri, status: "active" }, { uri, name: type === "kennismaking" ? (await crmSettings()).calendly_event_kennismaking : (await crmSettings()).calendly_event_sales, start_time: new Date(start).toISOString() }, { contactId, setterId, door: user.email });
  check(await db().from("crm_appointments").update({ bevestiging_via: "geen (handmatig)", herinnering_via: "geen (handmatig)" }).eq("calendly_invitee_uri", uri));
}
