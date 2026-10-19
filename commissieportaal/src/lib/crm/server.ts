import "server-only";
import { redirect } from "next/navigation";
import { clientKey } from "../acquisitie/calc";
import { acqSetters, type AcqSetter } from "../acquisitie/server";
import { getAcqSetter } from "../auth/acq-session";
import { getAdmin } from "../auth/session";
import { env } from "../env";
import { fetchSpreadsheet, SheetFetchError } from "../sheets/fetch";
import { extractSpreadsheetId } from "../sheets/parse-url";
import { db } from "../supabase/server";
import { dedupeLeads, faseLabel, FASES, isFase, normEmail, normPhone, parseLeadSheet, splitBehandelingen, type Pijplijn } from "./core";
import { provincieVoor } from "./provincies";

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Haalt alle rijen op in pagina's van 1000 (limiet van Supabase). */
async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = (check(await query(from, from + 999)) ?? []) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** 00:00 Amsterdamse tijd op `datum` (YYYY-MM-DD) als ISO-tijdstip in UTC. */
export function amsterdamMidnight(datum: string): string {
  const guess = new Date(`${datum}T00:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hourCycle: "h23" }).formatToParts(guess).map((p) => [p.type, p.value]),
  );
  return new Date(guess.getTime() - Number(parts.hour) * 3600000).toISOString();
}

// ---------- Gebruiker ----------

export type CrmUser = { rol: "admin"; email: string; setter: null } | { rol: "setter"; email: string; setter: AcqSetter };

export async function getCrmUser(): Promise<CrmUser | null> {
  const admin = await getAdmin();
  if (admin) return { rol: "admin", email: admin.email, setter: null };
  const setter = await getAcqSetter();
  return setter ? { rol: "setter", email: setter.email, setter } : null;
}

export async function requireCrmUser(): Promise<CrmUser> {
  const u = await getCrmUser();
  if (!u) redirect("/crm/login");
  return u;
}

export class CrmError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------- Typen ----------

export interface Contact {
  id: string;
  salon_naam: string;
  contactpersoon: string | null;
  telefoon: string | null;
  email: string | null;
  website: string | null;
  stad: string | null;
  provincie: string | null;
  behandelingen: string[];
  bron: string;
  eigenaar_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opp {
  id: string;
  contact_id: string;
  pijplijn: Pijplijn;
  fase: string;
  waarde_cents: number | null;
  setter_id: string | null;
  invitee_uri: string | null;
  afspraak_op: string | null;
  fase_sinds: string;
  updated_at: string;
}

export interface Card extends Opp {
  contact: Contact;
}

export interface Activity {
  id: string;
  door: string;
  setter_id: string | null;
  type: string;
  pijplijn: string | null;
  van: string | null;
  naar: string | null;
  tekst: string | null;
  created_at: string;
}

const CONTACT_COLS = "id, salon_naam, contactpersoon, telefoon, email, website, stad, provincie, behandelingen, bron, eigenaar_id, created_at, updated_at";
const OPP_COLS = "id, contact_id, pijplijn, fase, waarde_cents, setter_id, invitee_uri, afspraak_op, fase_sinds, updated_at";

async function log(a: Omit<Activity, "id" | "created_at" | "setter_id" | "pijplijn" | "van" | "naar" | "tekst"> & Partial<Activity> & { contact_id: string }) {
  check(await db().from("crm_activities").insert(a));
}

const actor = (u: CrmUser) => ({ door: u.email, setter_id: u.setter?.id ?? null });

// ---------- Bord ----------

export interface BoardFilter {
  q?: string;
  behandeling?: string;
  stad?: string;
  provincie?: string;
  setter?: string; // id, of "geen"
  mijn?: boolean;
}

export async function loadCards(pijplijn: Pijplijn, user: CrmUser): Promise<Card[]> {
  return all<Card>((from, to) => {
    let q = db().from("crm_opportunities").select(`${OPP_COLS}, contact:crm_contacts!inner(${CONTACT_COLS})`).eq("pijplijn", pijplijn);
    if (pijplijn === "sales" && user.rol === "setter") q = q.eq("setter_id", user.setter.id);
    return q.order("fase_sinds", { ascending: false }).order("id").range(from, to);
  });
}

export function filterCards(cards: Card[], f: BoardFilter, user: CrmUser): Card[] {
  const q = f.q?.trim().toLowerCase();
  return cards.filter((c) => {
    const k = c.contact;
    if (f.mijn && user.setter && k.eigenaar_id !== user.setter.id && c.setter_id !== user.setter.id) return false;
    if (f.behandeling && !k.behandelingen.includes(f.behandeling)) return false;
    if (f.stad && k.stad !== f.stad) return false;
    if (f.provincie && (f.provincie === "onbekend" ? !!k.provincie : k.provincie !== f.provincie)) return false;
    if (f.setter) {
      const wie = c.pijplijn === "sales" ? c.setter_id : k.eigenaar_id;
      if (f.setter === "geen" ? !!wie : wie !== f.setter) return false;
    }
    if (q && ![k.salon_naam, k.contactpersoon, k.telefoon, k.email, k.stad].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });
}

export function filterOptions(cards: Card[]) {
  const set = (vals: (string | null)[]) => [...new Set(vals.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "nl"));
  return {
    behandelingen: set(cards.flatMap((c) => c.contact.behandelingen)),
    steden: set(cards.map((c) => c.contact.stad)),
    provincies: set(cards.map((c) => c.contact.provincie)),
  };
}

// ---------- Contact ----------

export async function contactDetail(id: string, user: CrmUser) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const contact = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("id", id).maybeSingle()) as Contact | null;
  if (!contact) return null;
  const opps = (check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", id)) ?? []) as Opp[];
  const sales = opps.find((o) => o.pijplijn === "sales") ?? null;
  // Setters zien de salesfase alleen van hun eigen ingeplande leads.
  const zichtbareSales = user.rol === "admin" || (sales && sales.setter_id === user.setter.id) ? sales : null;
  const activiteit = (check(await db().from("crm_activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(200)) ??
    []) as Activity[];
  return {
    contact,
    outbound: opps.find((o) => o.pijplijn === "outbound") ?? null,
    sales: zichtbareSales,
    activiteit: user.rol === "admin" ? activiteit : activiteit.filter((a) => a.pijplijn !== "sales" || zichtbareSales),
    magBewerken: canEditOutbound(contact, user),
  };
}

function canEditOutbound(c: Pick<Contact, "eigenaar_id">, u: CrmUser) {
  return u.rol === "admin" || !c.eigenaar_id || c.eigenaar_id === u.setter.id;
}

async function getOpp(id: string): Promise<Opp & { contact: Contact }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CrmError("Onbekende lead.", 404);
  const o = check(await db().from("crm_opportunities").select(`${OPP_COLS}, contact:crm_contacts!inner(${CONTACT_COLS})`).eq("id", id).maybeSingle()) as unknown as
    | (Opp & { contact: Contact })
    | null;
  if (!o) throw new CrmError("Onbekende lead.", 404);
  return o;
}

function assertMag(o: Opp & { contact: Contact }, u: CrmUser) {
  if (o.pijplijn === "sales" && u.rol !== "admin") throw new CrmError("Alleen de admin past de salesfase aan.", 403);
  if (o.pijplijn === "outbound" && !canEditOutbound(o.contact, u)) throw new CrmError("Deze lead is al opgepakt door een andere setter.", 403);
}

/** Zet de setter als eigenaar als de lead nog van niemand is. */
async function claim(contact: Contact, u: CrmUser) {
  if (u.setter && !contact.eigenaar_id) {
    check(await db().from("crm_contacts").update({ eigenaar_id: u.setter.id, updated_at: new Date().toISOString() }).eq("id", contact.id).is("eigenaar_id", null));
    contact.eigenaar_id = u.setter.id;
  }
}

/** Maakt de saleskaart aan (fase Ingepland) als die er nog niet is. */
async function ensureSales(contact: Contact, setterId: string | null, extra: Partial<Opp> = {}, door = "systeem") {
  const bestaand = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", contact.id).eq("pijplijn", "sales").maybeSingle()) as Opp | null;
  if (bestaand) return bestaand;
  const opp = check(
    await db()
      .from("crm_opportunities")
      .insert({ contact_id: contact.id, pijplijn: "sales", fase: "ingepland", setter_id: setterId, ...extra })
      .select(OPP_COLS)
      .single(),
  ) as Opp;
  await log({ contact_id: contact.id, door, setter_id: setterId, type: "fase", pijplijn: "sales", van: null, naar: "ingepland", tekst: "In salespijplijn gezet" });
  return opp;
}

export async function moveOpp(user: CrmUser, oppId: string, fase: string) {
  const o = await getOpp(oppId);
  assertMag(o, user);
  if (!isFase(o.pijplijn, fase)) throw new CrmError("Onbekende fase.");
  if (o.fase === fase) return o;
  const now = new Date().toISOString();
  if (o.pijplijn === "outbound") await claim(o.contact, user);
  check(await db().from("crm_opportunities").update({ fase, fase_sinds: now, updated_at: now }).eq("id", o.id));
  await log({ contact_id: o.contact_id, ...actor(user), type: "fase", pijplijn: o.pijplijn, van: o.fase, naar: fase });
  if (o.pijplijn === "outbound" && fase === "ingepland") await ensureSales(o.contact, user.setter?.id ?? o.contact.eigenaar_id, {}, user.email);
  if (o.pijplijn === "sales") await syncClose({ ...o, fase });
  return { ...o, fase };
}

export async function setWaarde(user: CrmUser, oppId: string, cents: number | null) {
  const o = await getOpp(oppId);
  assertMag(o, user);
  check(await db().from("crm_opportunities").update({ waarde_cents: cents, updated_at: new Date().toISOString() }).eq("id", o.id));
  await log({ contact_id: o.contact_id, ...actor(user), type: "waarde", pijplijn: o.pijplijn, tekst: cents === null ? "Waarde verwijderd" : `Waarde € ${(cents / 100).toFixed(2).replace(".", ",")}` });
  if (o.pijplijn === "sales") await syncClose({ ...o, waarde_cents: cents });
}

export async function setSalesSetter(user: CrmUser, oppId: string, setterId: string | null) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
  const o = await getOpp(oppId);
  if (o.pijplijn !== "sales") throw new CrmError("Alleen voor de salespijplijn.");
  check(await db().from("crm_opportunities").update({ setter_id: setterId, updated_at: new Date().toISOString() }).eq("id", o.id));
  await log({ contact_id: o.contact_id, ...actor(user), type: "gegevens", pijplijn: "sales", tekst: setterId ? "Setter-tag aangepast" : "Setter-tag verwijderd" });
  await syncClose({ ...o, setter_id: setterId });
}

/**
 * Gewonnen + waarde + setter → close in de acquisitiecommissie (5%).
 * Uit Gewonnen (of zonder waarde/setter) → close weer weg.
 */
async function syncClose(o: Opp & { contact: Contact }) {
  let key: string;
  if (o.invitee_uri) {
    const m = check(await db().from("acq_meetings").select("email, phone, naam").eq("invitee_uri", o.invitee_uri).maybeSingle()) as
      | { email: string | null; phone: string | null; naam: string }
      | null;
    key = clientKey(m ?? { email: o.contact.email, phone: o.contact.telefoon, naam: o.contact.salon_naam });
  } else key = clientKey({ email: o.contact.email, phone: o.contact.telefoon, naam: o.contact.salon_naam });
  const bestaand = check(await db().from("acq_closes").select("client_key, opmerking").eq("client_key", key).maybeSingle()) as { opmerking: string | null } | null;
  if (o.fase === "gewonnen" && o.setter_id && o.waarde_cents) {
    check(
      await db()
        .from("acq_closes")
        .upsert(
          { client_key: key, setter_id: o.setter_id, bedrag_cents: o.waarde_cents, opmerking: `CRM: ${o.contact.salon_naam}`, ...(bestaand ? {} : { gemarkeerd_op: new Date().toISOString() }) },
          { onConflict: "client_key" },
        ),
    );
  } else if (bestaand?.opmerking?.startsWith("CRM:")) {
    // Alleen closes die het CRM zelf heeft gezet weer weghalen.
    check(await db().from("acq_closes").delete().eq("client_key", key));
  }
}

export async function addNote(user: CrmUser, contactId: string, tekst: string) {
  const t = tekst.trim().slice(0, 4000);
  if (!t) throw new CrmError("Lege notitie.");
  const c = check(await db().from("crm_contacts").select("id").eq("id", contactId).maybeSingle());
  if (!c) throw new CrmError("Onbekende lead.", 404);
  await log({ contact_id: contactId, ...actor(user), type: "notitie", tekst: t });
}

export interface ContactInput {
  salon_naam?: string;
  contactpersoon?: string;
  telefoon?: string;
  email?: string;
  website?: string;
  stad?: string;
  provincie?: string;
  behandelingen?: string;
  eigenaar_id?: string | null;
}

function cleanInput(i: ContactInput) {
  const s = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
  const out: Record<string, unknown> = {};
  if (i.salon_naam !== undefined) {
    if (!i.salon_naam.trim()) throw new CrmError("Salonnaam is verplicht.");
    out.salon_naam = i.salon_naam.trim();
  }
  if (i.contactpersoon !== undefined) out.contactpersoon = s(i.contactpersoon);
  if (i.telefoon !== undefined) {
    out.telefoon = s(i.telefoon);
    out.telefoon_norm = normPhone(i.telefoon);
  }
  if (i.email !== undefined) {
    if (i.email.trim() && !normEmail(i.email)) throw new CrmError("Ongeldig e-mailadres.");
    out.email = normEmail(i.email);
  }
  if (i.website !== undefined) out.website = s(i.website);
  if (i.stad !== undefined) out.stad = s(i.stad);
  if (i.provincie !== undefined) out.provincie = s(i.provincie) ?? (i.stad !== undefined ? provincieVoor(i.stad) : undefined);
  else if (i.stad !== undefined) out.provincie = provincieVoor(i.stad);
  if (i.behandelingen !== undefined) out.behandelingen = splitBehandelingen(i.behandelingen);
  return out;
}

const dupMessage = (e: unknown) => (e instanceof Error && /duplicate key/.test(e.message) ? new CrmError("Er bestaat al een lead met dit telefoonnummer of e-mailadres.", 409) : e);

export async function updateContact(user: CrmUser, id: string, input: ContactInput) {
  const c = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("id", id).maybeSingle()) as Contact | null;
  if (!c) throw new CrmError("Onbekende lead.", 404);
  if (!canEditOutbound(c, user)) throw new CrmError("Deze lead is al opgepakt door een andere setter.", 403);
  const data = cleanInput(input);
  if (input.eigenaar_id !== undefined) {
    if (user.rol !== "admin") throw new CrmError("Alleen de admin wijst leads toe.", 403);
    data.eigenaar_id = input.eigenaar_id || null;
  }
  try {
    check(await db().from("crm_contacts").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id));
  } catch (e) {
    throw dupMessage(e);
  }
  await log({ contact_id: id, ...actor(user), type: "gegevens", tekst: "Gegevens aangepast" });
}

export async function createContact(user: CrmUser, input: ContactInput) {
  const data = cleanInput({ ...input, salon_naam: input.salon_naam ?? "" });
  let c: { id: string };
  try {
    c = check(
      await db()
        .from("crm_contacts")
        .insert({ ...data, bron: "handmatig", eigenaar_id: user.setter?.id ?? null })
        .select("id")
        .single(),
    ) as { id: string };
  } catch (e) {
    throw dupMessage(e);
  }
  check(await db().from("crm_opportunities").insert({ contact_id: c.id, pijplijn: "outbound", fase: "nieuw" }));
  await log({ contact_id: c.id, ...actor(user), type: "import", tekst: "Handmatig toegevoegd" });
  return c.id;
}

// ---------- Import ----------

export async function importSheet(user: CrmUser, url: string) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin importeert.", 403);
  const id = extractSpreadsheetId(url);
  if (!id) throw new CrmError("Geen geldige Google Sheet-link.");
  let parsed;
  try {
    parsed = parseLeadSheet(await fetchSpreadsheet(id, env("GOOGLE_API_KEY")));
  } catch (e) {
    throw new CrmError(e instanceof SheetFetchError ? e.message : "De sheet kon niet worden gelezen.");
  }
  const { uniek, dubbel } = dedupeLeads(parsed.leads);

  // Bestaande contacten (telefoon/e-mail) overslaan.
  const tel = new Set<string>();
  const mail = new Set<string>();
  for (const p of await all<{ telefoon_norm: string | null; email: string | null }>((f, t) => db().from("crm_contacts").select("telefoon_norm, email").order("id").range(f, t))) {
    if (p.telefoon_norm) tel.add(p.telefoon_norm);
    if (p.email) mail.add(p.email);
  }
  const nieuw = uniek.filter((l) => !(l.telefoon_norm && tel.has(l.telefoon_norm)) && !(l.email && mail.has(l.email)));

  let toegevoegd = 0;
  for (let k = 0; k < nieuw.length; k += 200) {
    const rows = nieuw.slice(k, k + 200).map((l) => ({ ...l, bron: "sheet" }));
    const ins = (check(await db().from("crm_contacts").insert(rows).select("id")) ?? []) as { id: string }[];
    check(await db().from("crm_opportunities").insert(ins.map((c) => ({ contact_id: c.id, pijplijn: "outbound", fase: "nieuw" }))));
    check(await db().from("crm_activities").insert(ins.map((c) => ({ contact_id: c.id, door: user.email, type: "import", tekst: "Geïmporteerd uit Google Sheet" }))));
    toegevoegd += ins.length;
  }
  return { toegevoegd, bestaand: uniek.length - nieuw.length, dubbel, overgeslagen: parsed.overgeslagen, zonderProvincie: nieuw.filter((l) => !l.provincie).length };
}

// ---------- Calendly → CRM ----------

interface MeetingRow {
  invitee_uri: string;
  start_time: string;
  status: "active" | "canceled";
  no_show: boolean;
  email: string | null;
  phone: string | null;
  naam: string;
  utm_source: string | null;
  raw: { invitee?: { questions_and_answers?: { question: string; answer: string }[] | null } };
}

/**
 * Koppelt Calendly-afspraken (vanaf crm_calendly_vanaf) aan het CRM:
 * - lead zoeken op e-mail of telefoon, anders aanmaken;
 * - outbound → Ingepland, saleskaart aanmaken met setter-tag (UTM, anders eigenaar);
 * - no-show → salesfase No-show; geannuleerd → notitie.
 * Idempotent: kan elk uur draaien.
 */
export async function linkCalendly() {
  const s = check(await db().from("acq_settings").select("event_naam, crm_calendly_vanaf").eq("id", 1).single()) as { event_naam: string; crm_calendly_vanaf: string };
  const meetings = await all<MeetingRow>((f, t) =>
    db()
      .from("acq_meetings")
      .select("invitee_uri, start_time, status, no_show, email, phone, naam, utm_source, raw")
      .eq("event_name", s.event_naam)
      .gte("start_time", amsterdamMidnight(s.crm_calendly_vanaf))
      .order("start_time")
      .order("invitee_uri")
      .range(f, t),
  );
  const setters = await acqSetters();
  const byUtm = new Map(setters.map((x) => [x.utm_source.toLowerCase(), x.id]));
  let gekoppeld = 0;
  let aangemaakt = 0;

  for (const m of meetings) {
    const sales = check(await db().from("crm_opportunities").select(`${OPP_COLS}, contact:crm_contacts!inner(${CONTACT_COLS})`).eq("invitee_uri", m.invitee_uri).maybeSingle()) as unknown as
      | (Opp & { contact: Contact })
      | null;

    if (m.status === "canceled") {
      if (sales) {
        check(await db().from("crm_opportunities").update({ invitee_uri: null, afspraak_op: null, updated_at: new Date().toISOString() }).eq("id", sales.id));
        await log({ contact_id: sales.contact_id, door: "calendly", type: "calendly", pijplijn: "sales", tekst: "Afspraak geannuleerd in Calendly" });
      }
      continue;
    }

    if (sales) {
      const upd: Record<string, unknown> = {};
      if (sales.afspraak_op && new Date(sales.afspraak_op).getTime() !== new Date(m.start_time).getTime()) upd.afspraak_op = m.start_time;
      if (m.no_show && sales.fase === "ingepland") {
        upd.fase = "no_show";
        upd.fase_sinds = new Date().toISOString();
      }
      if (Object.keys(upd).length) {
        check(await db().from("crm_opportunities").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", sales.id));
        if (upd.fase) await log({ contact_id: sales.contact_id, door: "calendly", type: "fase", pijplijn: "sales", van: "ingepland", naar: "no_show", tekst: "No-show gemarkeerd in Calendly" });
        else await log({ contact_id: sales.contact_id, door: "calendly", type: "calendly", pijplijn: "sales", tekst: "Afspraak verzet in Calendly" });
      }
      continue;
    }

    // Nieuwe afspraak: lead zoeken of aanmaken.
    const tel = normPhone(m.phone);
    let contact: Contact | null = null;
    if (m.email) contact = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("email", m.email).maybeSingle()) as Contact | null;
    if (!contact && tel) contact = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("telefoon_norm", tel).maybeSingle()) as Contact | null;
    if (!contact) {
      const qa = m.raw?.invitee?.questions_and_answers ?? [];
      const salon = qa.find((q) => /salon|bedrijf|kliniek|praktijk|onderneming/i.test(q.question))?.answer?.trim();
      const stad = qa.find((q) => /stad|plaats|woonplaats|vestiging/i.test(q.question))?.answer?.trim() || null;
      contact = check(
        await db()
          .from("crm_contacts")
          .insert({
            salon_naam: salon || m.naam || m.email || "Onbekend",
            contactpersoon: m.naam || null,
            telefoon: m.phone,
            telefoon_norm: tel,
            email: m.email,
            stad,
            provincie: provincieVoor(stad),
            bron: "calendly",
          })
          .select(CONTACT_COLS)
          .single(),
      ) as Contact;
      check(await db().from("crm_opportunities").insert({ contact_id: contact.id, pijplijn: "outbound", fase: "nieuw" }));
      aangemaakt++;
    }
    const setterId = (m.utm_source && byUtm.get(m.utm_source)) || contact.eigenaar_id || null;
    if (setterId && !contact.eigenaar_id) check(await db().from("crm_contacts").update({ eigenaar_id: setterId }).eq("id", contact.id));

    const outbound = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", contact.id).eq("pijplijn", "outbound").maybeSingle()) as Opp | null;
    if (outbound && outbound.fase !== "ingepland") {
      const now = new Date().toISOString();
      check(await db().from("crm_opportunities").update({ fase: "ingepland", fase_sinds: now, updated_at: now }).eq("id", outbound.id));
      await log({ contact_id: contact.id, door: "calendly", setter_id: setterId, type: "fase", pijplijn: "outbound", van: outbound.fase, naar: "ingepland", tekst: "Ingepland via Calendly" });
    }
    const bestaand = await ensureSales(contact, setterId, { invitee_uri: m.invitee_uri, afspraak_op: m.start_time }, "calendly");
    const later = !bestaand.afspraak_op || new Date(m.start_time).getTime() > new Date(bestaand.afspraak_op).getTime();
    if (bestaand.invitee_uri !== m.invitee_uri && (later || !bestaand.invitee_uri)) {
      // Saleskaart bestond al (handmatig ingepland of eerdere afspraak): koppel deze afspraak.
      check(
        await db()
          .from("crm_opportunities")
          .update({ invitee_uri: m.invitee_uri, afspraak_op: m.start_time, setter_id: bestaand.setter_id ?? setterId, updated_at: new Date().toISOString() })
          .eq("id", bestaand.id),
      );
      await log({ contact_id: contact.id, door: "calendly", type: "calendly", pijplijn: "sales", tekst: `Afspraak in Calendly: ${new Date(m.start_time).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}` });
      gekoppeld++;
    } else if (bestaand.invitee_uri === m.invitee_uri) gekoppeld++;
  }
  return { gekoppeld, aangemaakt };
}

// ---------- Cijfers ----------

export interface SetterStats {
  setterId: string | null;
  naam: string;
  opgepakt: number;
  gebeld: number;
  wafu: number;
  opvolgen: number;
  ingepland: number;
  verloren: number;
  gesprek: number;
  noShow: number;
  gewonnen: number;
  gewonnenCents: number;
}

/** Tellingen per setter in een periode (unieke leads per fase-overgang). */
export async function stats(start: string, eind: string, user: CrmUser): Promise<{ rijen: SetterStats[]; pijplijn: Record<Pijplijn, { fase: string; label: string; aantal: number; waardeCents: number }[]> }> {
  const setters = await acqSetters();
  const acts = await all<{ contact_id: string; setter_id: string | null; pijplijn: string; naar: string }>((f, t) =>
    db()
      .from("crm_activities")
      .select("contact_id, setter_id, pijplijn, naar")
      .eq("type", "fase")
      .gte("created_at", amsterdamMidnight(start))
      .lt("created_at", amsterdamMidnight(eind))
      .order("id")
      .range(f, t),
  );

  // Salesfases tellen voor de setter met de tag.
  const salesOpps = await all<{ contact_id: string; setter_id: string | null; fase: string; waarde_cents: number | null }>((f, t) =>
    db().from("crm_opportunities").select("contact_id, setter_id, fase, waarde_cents").eq("pijplijn", "sales").order("id").range(f, t),
  );
  const tagVan = new Map(salesOpps.map((o) => [o.contact_id, o.setter_id]));

  const rows = new Map<string, SetterStats & { sets: Record<string, Set<string>> }>();
  const row = (id: string | null) => {
    const k = id ?? "geen";
    if (!rows.has(k)) {
      rows.set(k, {
        setterId: id,
        naam: setters.find((x) => x.id === id)?.naam ?? "Admin / geen setter",
        opgepakt: 0, gebeld: 0, wafu: 0, opvolgen: 0, ingepland: 0, verloren: 0, gesprek: 0, noShow: 0, gewonnen: 0, gewonnenCents: 0,
        sets: {},
      });
    }
    return rows.get(k)!;
  };
  for (const s of setters.filter((x) => x.actief)) row(s.id);
  for (const a of acts) {
    const wie = a.pijplijn === "sales" ? (tagVan.get(a.contact_id) ?? a.setter_id) : a.setter_id;
    const r = row(wie);
    const k = `${a.pijplijn}:${a.naar}`;
    (r.sets[k] ??= new Set()).add(a.contact_id);
    (r.sets.opgepakt ??= new Set()).add(a.contact_id);
  }
  for (const r of rows.values()) {
    const n = (k: string) => r.sets[k]?.size ?? 0;
    r.opgepakt = [...(r.sets.opgepakt ?? [])].length;
    r.gebeld = n("outbound:gebeld");
    r.wafu = n("outbound:wafu");
    r.opvolgen = n("outbound:opvolgen");
    r.ingepland = new Set([...(r.sets["outbound:ingepland"] ?? []), ...(r.sets["sales:ingepland"] ?? [])]).size;
    r.verloren = n("outbound:verloren");
    r.gesprek = n("sales:gesprek");
    r.noShow = n("sales:no_show");
    const won = r.sets["sales:gewonnen"] ?? new Set();
    r.gewonnen = won.size;
    r.gewonnenCents = salesOpps.filter((o) => won.has(o.contact_id) && o.fase === "gewonnen").reduce((s, o) => s + (o.waarde_cents ?? 0), 0);
  }

  const pijplijn = {} as Record<Pijplijn, { fase: string; label: string; aantal: number; waardeCents: number }[]>;
  for (const p of ["outbound", "sales"] as Pijplijn[]) {
    if (p === "sales" && user.rol !== "admin") {
      pijplijn.sales = [];
      continue;
    }
    const opps = await all<{ fase: string; waarde_cents: number | null }>((f, t) => db().from("crm_opportunities").select("fase, waarde_cents").eq("pijplijn", p).order("id").range(f, t));
    pijplijn[p] = FASES[p].map((f) => ({
      fase: f.key,
      label: faseLabel(p, f.key),
      aantal: opps.filter((o) => o.fase === f.key).length,
      waardeCents: opps.filter((o) => o.fase === f.key).reduce((s, o) => s + (o.waarde_cents ?? 0), 0),
    }));
  }

  let rijen = [...rows.values()].map(({ sets: _s, ...r }) => r);
  if (user.rol === "setter") rijen = rijen.filter((r) => r.setterId === user.setter.id);
  return { rijen, pijplijn };
}
