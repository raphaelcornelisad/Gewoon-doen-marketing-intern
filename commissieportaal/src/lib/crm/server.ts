import "server-only";
import { redirect } from "next/navigation";
import { acqSetters, type AcqSetter } from "../acquisitie/server";
import { getAcqSetter } from "../auth/acq-session";
import { getAdmin } from "../auth/session";
import { env } from "../env";
import { fetchSpreadsheet, SheetFetchError } from "../sheets/fetch";
import { extractSpreadsheetId } from "../sheets/parse-url";
import { db } from "../supabase/server";
import {
  BELBAAR,
  dedupeLeads,
  domeinVan,
  faseUitStatus,
  FASES,
  faseLabel,
  isFase,
  naamSleutel,
  normEmail,
  normPhone,
  parseCsv,
  parseLeadRows,
  parseLeadSheet,
  splitBehandelingen,
  type ImportLead,
  type Pijplijn,
} from "./core";
import { herbereken } from "./grootboek";
import { provincieVoor } from "./provincies";
import { huidigeCrmId } from "./werkruimte";

export function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Haalt alle rijen op in pagina's van 1000 (limiet van Supabase). */
export async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
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

// ---------- Gebruiker en rechten ----------

export type CrmUser =
  | { rol: "admin"; email: string; setter: null }
  | { rol: "setter"; email: string; setter: AcqSetter }
  | { rol: "sales"; email: string; setter: AcqSetter };

export async function getCrmUser(): Promise<CrmUser | null> {
  const admin = await getAdmin();
  if (admin) return { rol: "admin", email: admin.email, setter: null };
  const s = await getAcqSetter();
  if (!s) return null;
  return s.rol === "sales" ? { rol: "sales", email: s.email, setter: s } : { rol: "setter", email: s.email, setter: s };
}

export async function requireCrmUser(): Promise<CrmUser> {
  const u = await getCrmUser();
  if (!u) redirect("/crm/login");
  return u;
}

export class CrmError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const isAdmin = (u: CrmUser) => u.rol === "admin";

// ---------- Typen ----------

export interface Contact {
  id: string;
  salon_naam: string;
  contactpersoon: string | null;
  telefoon: string | null;
  telefoon_norm: string | null;
  email: string | null;
  website: string | null;
  domein: string | null;
  adres: string | null;
  postcode: string | null;
  stad: string | null;
  provincie: string | null;
  type_bedrijf: string | null;
  behandelingen: string[];
  tags: string[];
  bron: string;
  bron_url: string | null;
  eigenaar_id: string | null;
  oorspronkelijke_setter_id: string | null;
  laatste_contact_op: string | null;
  volgende_opvolging_op: string | null;
  belpogingen: number;
  niet_benaderen: boolean;
  niet_benaderen_reden: string | null;
  gereserveerd_door: string | null;
  gereserveerd_tot: string | null;
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
  verkoper_id: string | null;
  offerte_op: string | null;
  offerte_cents: number | null;
  sluitdatum: string | null;
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

export const CONTACT_COLS =
  "id, salon_naam, contactpersoon, telefoon, telefoon_norm, email, website, domein, adres, postcode, stad, provincie, type_bedrijf, behandelingen, tags, bron, bron_url, eigenaar_id, oorspronkelijke_setter_id, laatste_contact_op, volgende_opvolging_op, belpogingen, niet_benaderen, niet_benaderen_reden, gereserveerd_door, gereserveerd_tot, created_at, updated_at";
export const OPP_COLS = "id, contact_id, pijplijn, fase, waarde_cents, setter_id, verkoper_id, offerte_op, offerte_cents, sluitdatum, fase_sinds, updated_at";

export async function log(a: { contact_id: string; door: string; type: string } & Partial<Omit<Activity, "id" | "created_at">>) {
  check(await db().from("crm_activities").insert(a));
}

export const actor = (u: CrmUser) => ({ door: u.email, setter_id: u.setter?.id ?? null });

export async function getContact(id: string): Promise<Contact> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CrmError("Onbekende lead.", 404);
  const c = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("id", id).maybeSingle()) as Contact | null;
  if (!c) throw new CrmError("Onbekende lead.", 404);
  return c;
}

/** Outbound bewerken: admin, of setter als de lead van niemand of van haar is. */
export function magOutbound(c: Pick<Contact, "eigenaar_id">, u: CrmUser) {
  return u.rol === "admin" || (u.rol === "setter" && (!c.eigenaar_id || c.eigenaar_id === u.setter.id));
}

/** Sales bewerken: admin, of de toegewezen salesmedewerker. */
export function magSales(o: Pick<Opp, "verkoper_id">, u: CrmUser) {
  return u.rol === "admin" || (u.rol === "sales" && o.verkoper_id === u.setter.id);
}

/** Lead zien: admin; setter (belpool + eigen + door haar ingepland); sales (toegewezen salesleads). */
function magZien(c: Contact, sales: Opp | null, u: CrmUser) {
  if (u.rol === "admin") return true;
  if (u.rol === "sales") return !!sales && sales.verkoper_id === u.setter.id;
  return !c.eigenaar_id || c.eigenaar_id === u.setter.id || sales?.setter_id === u.setter.id;
}

/** Lead aan setter toewijzen (na een geregistreerde belpoging). Oorspronkelijke setter wordt één keer gezet. */
export async function wijsToe(contact: Contact, setterId: string, door: string) {
  if (contact.eigenaar_id === setterId) return;
  if (contact.eigenaar_id) return; // nooit stil van een ander afpakken
  check(
    await db()
      .from("crm_contacts")
      .update({ eigenaar_id: setterId, oorspronkelijke_setter_id: contact.oorspronkelijke_setter_id ?? setterId, updated_at: new Date().toISOString() })
      .eq("id", contact.id)
      .is("eigenaar_id", null),
  );
  await log({ contact_id: contact.id, door, setter_id: setterId, type: "eigenaar", van: null, naar: setterId, tekst: "Toegewezen na belpoging" });
  contact.eigenaar_id = setterId;
  contact.oorspronkelijke_setter_id ??= setterId;
}

// ---------- Bord ----------

export interface BoardFilter {
  q?: string;
  behandeling?: string;
  type?: string;
  stad?: string;
  provincie?: string;
  setter?: string; // id, of "geen"
  tag?: string;
  weergave?: "vandaag" | "achterstallig" | "nieuw" | "mijn" | "vrij";
  heeft?: "telefoon" | "website" | "email";
}

export async function loadCards(pijplijn: Pijplijn, user: CrmUser): Promise<Card[]> {
  const crm = await huidigeCrmId();
  const cards = await all<Card>((from, to) => {
    let q = db().from("crm_opportunities").select(`${OPP_COLS}, contact:crm_contacts!inner(${CONTACT_COLS})`).eq("pijplijn", pijplijn).eq("contact.crm_id", crm);
    if (pijplijn === "sales" && user.rol === "setter") q = q.eq("setter_id", user.setter.id);
    if (pijplijn === "sales" && user.rol === "sales") q = q.eq("verkoper_id", user.setter.id);
    return q.order("fase_sinds", { ascending: false }).order("id").range(from, to);
  });
  if (pijplijn === "outbound" && user.rol === "sales") return [];
  // Klanten horen niet in de werklijsten (outbound of call geboekt).
  const klanten = new Set(
    (await all<{ contact_id: string }>((f, t) => db().from("crm_opportunities").select("contact_id").eq("pijplijn", "outbound").eq("fase", "klant").order("contact_id").range(f, t))).map((r) => r.contact_id),
  );
  return cards.filter((c) => !klanten.has(c.contact_id));
}

const amsVandaag = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export function filterCards(cards: Card[], f: BoardFilter, user: CrmUser): Card[] {
  const q = f.q?.trim().toLowerCase();
  const vandaagStart = new Date(amsterdamMidnight(amsVandaag())).getTime();
  const vandaagEind = vandaagStart + 86400000;
  return cards.filter((c) => {
    const k = c.contact;
    const opv = k.volgende_opvolging_op ? new Date(k.volgende_opvolging_op).getTime() : null;
    if (f.weergave === "vandaag" && !(opv !== null && opv >= vandaagStart && opv < vandaagEind)) return false;
    if (f.weergave === "achterstallig" && !(opv !== null && opv < vandaagStart)) return false;
    if (f.weergave === "nieuw" && c.fase !== "nieuw") return false;
    if (f.weergave === "mijn" && !(user.setter && (k.eigenaar_id === user.setter.id || c.setter_id === user.setter.id))) return false;
    if (f.weergave === "vrij" && k.eigenaar_id) return false;
    if (f.heeft === "telefoon" && !k.telefoon_norm) return false;
    if (f.heeft === "website" && !k.website) return false;
    if (f.heeft === "email" && !k.email) return false;
    if (f.behandeling && !k.behandelingen.includes(f.behandeling)) return false;
    if (f.type && k.type_bedrijf !== f.type) return false;
    if (f.tag && !k.tags.includes(f.tag)) return false;
    if (f.stad && k.stad !== f.stad) return false;
    if (f.provincie && (f.provincie === "onbekend" ? !!k.provincie : k.provincie !== f.provincie)) return false;
    if (f.setter) {
      const wie = c.pijplijn === "sales" ? c.setter_id : k.eigenaar_id;
      if (f.setter === "geen" ? !!wie : wie !== f.setter) return false;
    }
    if (q && ![k.salon_naam, k.contactpersoon, k.telefoon, k.email, k.stad, k.domein].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });
}

export function filterOptions(cards: Card[]) {
  const set = (vals: (string | null)[]) => [...new Set(vals.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "nl"));
  return {
    behandelingen: set(cards.flatMap((c) => c.contact.behandelingen)),
    types: set(cards.map((c) => c.contact.type_bedrijf)),
    tags: set(cards.flatMap((c) => c.contact.tags)),
    steden: set(cards.map((c) => c.contact.stad)),
    provincies: set(cards.map((c) => c.contact.provincie)),
  };
}

/** Alle gebruikte tags (voor suggesties). */
export async function allTags(): Promise<string[]> {
  const crm = await huidigeCrmId();
  const rows = await all<{ tags: string[] }>((f, t) => db().from("crm_contacts").select("tags").eq("crm_id", crm).neq("tags", "{}").order("id").range(f, t));
  return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "nl"));
}

// ---------- Opgeslagen weergaven ----------

export async function views(user: CrmUser) {
  return (check(await db().from("crm_views").select("id, naam, pijplijn, query").eq("eigenaar", user.email).order("naam")) ?? []) as { id: string; naam: string; pijplijn: string; query: string }[];
}

// ---------- Leadkaart ----------

export async function contactDetail(id: string, user: CrmUser) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const contact = check(await db().from("crm_contacts").select(CONTACT_COLS).eq("id", id).maybeSingle()) as Contact | null;
  if (!contact) return null;
  const opps = (check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", id)) ?? []) as Opp[];
  const sales = opps.find((o) => o.pijplijn === "sales") ?? null;
  if (!magZien(contact, sales, user)) return null;
  const [activiteit, calls, berichten, afspraken, taken, toestemming, commissie] = await Promise.all([
    db().from("crm_activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(300),
    db().from("crm_calls").select("*").eq("contact_id", id).order("gestart_op", { ascending: false }).limit(100),
    db().from("crm_messages").select("*").eq("contact_id", id).order("created_at", { ascending: true }).limit(500),
    db().from("crm_appointments").select("*").eq("contact_id", id).order("start_op", { ascending: false }),
    db().from("crm_tasks").select("*").eq("contact_id", id).order("vervalt_op", { ascending: true, nullsFirst: false }),
    db().from("crm_consents").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    db().from("commission_ledger").select("id, setter_id, soort, bedrag_cents, status, uitleg, datum").eq("contact_id", id).order("datum"),
  ]);
  const zieCommissie = (r: { setter_id: string }) => user.rol === "admin" || (user.setter && r.setter_id === user.setter.id);
  return {
    contact,
    outbound: opps.find((o) => o.pijplijn === "outbound") ?? null,
    sales,
    activiteit: (check(activiteit) ?? []) as Activity[],
    calls: (check(calls) ?? []) as CallRow[],
    berichten: (check(berichten) ?? []) as MessageRow[],
    afspraken: (check(afspraken) ?? []) as AppointmentRow[],
    taken: (check(taken) ?? []) as TaskRow[],
    toestemming: (check(toestemming) ?? []) as ConsentRow[],
    commissie: ((check(commissie) ?? []) as { id: string; setter_id: string; soort: string; bedrag_cents: number; status: string; uitleg: string; datum: string }[]).filter(zieCommissie),
    magOutbound: magOutbound(contact, user),
    magSales: sales ? magSales(sales, user) : false,
  };
}

export interface CallRow {
  id: string;
  setter_id: string | null;
  door: string;
  provider: string;
  provider_status: string | null;
  gestart_op: string;
  duur_sec: number | null;
  uitkomst: string | null;
  notitie: string | null;
  opname_url: string | null;
  transcript: { start: number; spreker: string; tekst: string }[] | null;
  samenvatting: string | null;
  bezwaren: { categorie: string; citaat: string; tijdstip_sec: number }[] | null;
  vervolgstap: string | null;
  analyse_status: string | null;
}
export interface MessageRow {
  id: string;
  kanaal: "whatsapp" | "sms";
  richting: "in" | "uit";
  tekst: string;
  status: string;
  fout: string | null;
  door: string;
  setter_id: string | null;
  created_at: string;
}
export interface AppointmentRow {
  id: string;
  type: "kennismaking" | "salesgesprek";
  status: string;
  start_op: string;
  eind_op: string | null;
  attributie: string;
  setter_id: string | null;
  vorige_afspraak_id: string | null;
  bevestiging_via: string;
  herinnering_via: string;
  status_door: string | null;
}
export interface TaskRow {
  id: string;
  titel: string;
  vervalt_op: string | null;
  gedaan_op: string | null;
  toegewezen_aan: string | null;
  door: string;
}
export interface ConsentRow {
  id: string;
  kanaal: string;
  categorie: string;
  status: string;
  bron: string;
  vastgelegd_door: string;
  created_at: string;
}

// ---------- Pijplijn ----------

async function getOpp(id: string): Promise<Opp & { contact: Contact }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CrmError("Onbekende lead.", 404);
  const o = check(await db().from("crm_opportunities").select(`${OPP_COLS}, contact:crm_contacts!inner(${CONTACT_COLS})`).eq("id", id).maybeSingle()) as unknown as
    | (Opp & { contact: Contact })
    | null;
  if (!o) throw new CrmError("Onbekende lead.", 404);
  return o;
}

function assertMag(o: Opp & { contact: Contact }, u: CrmUser) {
  if (o.pijplijn === "sales" && !magSales(o, u)) throw new CrmError("Je mag de salesfase van deze lead niet aanpassen.", 403);
  if (o.pijplijn === "outbound" && !magOutbound(o.contact, u)) throw new CrmError("Deze lead is van een andere setter.", 403);
}

/** Saleskaart (fase Ingepland) aanmaken als die er nog niet is. Zelfde contact, geen duplicaat. */
export async function ensureSales(contactId: string, setterId: string | null, door: string): Promise<Opp> {
  const bestaand = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", contactId).eq("pijplijn", "sales").maybeSingle()) as Opp | null;
  if (bestaand) return bestaand;
  const verkopers = (await acqSetters()).filter((s) => s.actief && s.rol === "sales");
  const r = await db()
    .from("crm_opportunities")
    .insert({ contact_id: contactId, pijplijn: "sales", fase: "ingepland", setter_id: setterId, verkoper_id: verkopers.length === 1 ? verkopers[0].id : null })
    .select(OPP_COLS)
    .single();
  if (r.error && /duplicate key/.test(r.error.message)) {
    return check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", contactId).eq("pijplijn", "sales").single()) as Opp;
  }
  const opp = check(r) as Opp;
  await log({ contact_id: contactId, door, setter_id: setterId, type: "fase", pijplijn: "sales", van: null, naar: "ingepland", tekst: "Doorgestroomd naar sales" });
  return opp;
}

/** Fase zetten zonder rechtencontrole (voor systeemprocessen). Logt de wijziging. */
export async function zetFase(o: Pick<Opp, "id" | "contact_id" | "pijplijn" | "fase">, fase: string, door: string, setterId: string | null, tekst?: string) {
  if (o.fase === fase) return;
  const now = new Date().toISOString();
  check(await db().from("crm_opportunities").update({ fase, fase_sinds: now, updated_at: now }).eq("id", o.id));
  await log({ contact_id: o.contact_id, door, setter_id: setterId, type: "fase", pijplijn: o.pijplijn, van: o.fase, naar: fase, tekst: tekst ?? null });
}

export interface MoveExtra {
  waarde_cents?: number | null;
  sluitdatum?: string | null;
  offerte_op?: string | null;
  offerte_cents?: number | null;
}

const datumOk = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function moveOpp(user: CrmUser, oppId: string, fase: string, extra: MoveExtra = {}) {
  const o = await getOpp(oppId);
  assertMag(o, user);
  if (!isFase(o.pijplijn, fase)) throw new CrmError("Onbekende fase.");
  if (o.fase === fase && !Object.keys(extra).length) return o;

  if (o.pijplijn === "outbound") {
    if (fase === "ingepland" && user.rol !== "admin") throw new CrmError("Inplannen gaat via de knop Inplannen (Calendly). De lead schuift door zodra de boeking bevestigd is.");
    if (user.setter) await wijsToe(o.contact, user.setter.id, user.email);
    if (fase === "niet_benaderen") {
      check(await db().from("crm_contacts").update({ niet_benaderen: true, niet_benaderen_reden: "Fase Niet meer benaderen", volgende_opvolging_op: null }).eq("id", o.contact_id));
    }
  }

  const upd: Record<string, unknown> = {};
  if (o.pijplijn === "sales" && fase === "offerte") {
    const op = extra.offerte_op ?? o.offerte_op;
    const bedrag = extra.offerte_cents ?? o.offerte_cents;
    if (!datumOk(op) || !bedrag) throw new CrmError("Vul de offertedatum en de offertewaarde in.");
    Object.assign(upd, { offerte_op: op, offerte_cents: bedrag, waarde_cents: o.waarde_cents ?? bedrag });
  }
  if (o.pijplijn === "sales" && fase === "geaccepteerd") {
    const waarde = extra.waarde_cents ?? o.waarde_cents;
    const sluit = extra.sluitdatum ?? o.sluitdatum;
    if (!waarde || !datumOk(sluit)) throw new CrmError("Vul de definitieve dealwaarde (excl. btw) en de sluitingsdatum in.");
    Object.assign(upd, { waarde_cents: waarde, sluitdatum: sluit });
  }
  if (Object.keys(upd).length) check(await db().from("crm_opportunities").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", o.id));
  await zetFase(o, fase, user.email, user.setter?.id ?? null);

  if (o.pijplijn === "outbound" && fase === "ingepland") await ensureSales(o.contact_id, o.contact.eigenaar_id, user.email);
  if (o.pijplijn === "sales" && fase === "geaccepteerd") {
    const ob = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", o.contact_id).eq("pijplijn", "outbound").maybeSingle()) as Opp | null;
    if (ob && ob.fase !== "klant") await zetFase(ob, "klant", user.email, null, "Deal geaccepteerd");
  }
  if (o.pijplijn === "sales") await herbereken(user.email);
  return { ...o, fase };
}

export async function setWaarde(user: CrmUser, oppId: string, cents: number | null) {
  const o = await getOpp(oppId);
  assertMag(o, user);
  if (o.fase === "geaccepteerd" && !cents) throw new CrmError("Een geaccepteerde deal heeft een dealwaarde nodig.");
  check(await db().from("crm_opportunities").update({ waarde_cents: cents, updated_at: new Date().toISOString() }).eq("id", o.id));
  const oud = o.waarde_cents === null ? "geen" : `€ ${(o.waarde_cents / 100).toFixed(2).replace(".", ",")}`;
  const nieuw = cents === null ? "geen" : `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  await log({ contact_id: o.contact_id, ...actor(user), type: "waarde", pijplijn: o.pijplijn, van: oud, naar: nieuw, tekst: `Waarde ${oud} → ${nieuw}` });
  if (o.pijplijn === "sales") await herbereken(user.email);
}

export async function setSluitdatum(user: CrmUser, oppId: string, datum: string | null) {
  const o = await getOpp(oppId);
  assertMag(o, user);
  if (datum !== null && !datumOk(datum)) throw new CrmError("Ongeldige datum.");
  if (o.fase === "geaccepteerd" && !datum) throw new CrmError("Een geaccepteerde deal heeft een sluitingsdatum nodig.");
  check(await db().from("crm_opportunities").update({ sluitdatum: datum, updated_at: new Date().toISOString() }).eq("id", o.id));
  await log({ contact_id: o.contact_id, ...actor(user), type: "waarde", pijplijn: o.pijplijn, tekst: `Sluitingsdatum ${datum ?? "verwijderd"}` });
  await herbereken(user.email);
}

/** Toegeschreven setter van een salesdeal (commissie). Alleen admin; zichtbaar in de historie. */
export async function setSalesSetter(user: CrmUser, oppId: string, setterId: string | null) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin wijzigt de commissietoewijzing.", 403);
  const o = await getOpp(oppId);
  if (o.pijplijn !== "sales") throw new CrmError("Alleen voor de salespijplijn.");
  check(await db().from("crm_opportunities").update({ setter_id: setterId, updated_at: new Date().toISOString() }).eq("id", o.id));
  await log({ contact_id: o.contact_id, ...actor(user), type: "attributie", pijplijn: "sales", van: o.setter_id, naar: setterId, tekst: "Commissietoewijzing (close) aangepast" });
  await herbereken(user.email);
}

export async function setVerkoper(user: CrmUser, oppId: string, verkoperId: string | null) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin wijst salesleads toe.", 403);
  const o = await getOpp(oppId);
  check(await db().from("crm_opportunities").update({ verkoper_id: verkoperId, updated_at: new Date().toISOString() }).eq("id", o.id));
  await log({ contact_id: o.contact_id, ...actor(user), type: "eigenaar", pijplijn: "sales", van: o.verkoper_id, naar: verkoperId, tekst: "Salesmedewerker aangepast" });
}

// ---------- Contact ----------

export async function addNote(user: CrmUser, contactId: string, tekst: string) {
  const t = tekst.trim().slice(0, 4000);
  if (!t) throw new CrmError("Lege notitie.");
  const c = await getContact(contactId);
  const sales = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", contactId).eq("pijplijn", "sales").maybeSingle()) as Opp | null;
  if (!magZien(c, sales, user)) throw new CrmError("Geen toegang.", 403);
  await log({ contact_id: contactId, ...actor(user), type: "notitie", tekst: t });
}

export interface ContactInput {
  salon_naam?: string;
  contactpersoon?: string;
  telefoon?: string;
  email?: string;
  website?: string;
  adres?: string;
  postcode?: string;
  stad?: string;
  provincie?: string;
  type_bedrijf?: string;
  behandelingen?: string;
  eigenaar_id?: string | null;
  tags?: string[];
  volgende_opvolging_op?: string | null;
  niet_benaderen?: boolean;
  niet_benaderen_reden?: string;
}

export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) throw new CrmError("Ongeldige tags.");
  const out: string[] = [];
  for (const t of v) {
    const s = String(t).trim().replace(/\s+/g, " ").slice(0, 40);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 20);
}

function cleanInput(i: ContactInput) {
  const s = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
  const out: Record<string, unknown> = {};
  if (i.salon_naam !== undefined) {
    if (!i.salon_naam.trim()) throw new CrmError("Bedrijfsnaam is verplicht.");
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
  if (i.website !== undefined) {
    out.website = s(i.website);
    out.domein = domeinVan(i.website);
  }
  for (const k of ["adres", "postcode", "type_bedrijf"] as const) if (i[k] !== undefined) out[k] = s(i[k]);
  if (i.stad !== undefined) out.stad = s(i.stad);
  if (i.provincie !== undefined) out.provincie = s(i.provincie) ?? (i.stad !== undefined ? provincieVoor(i.stad) : null);
  else if (i.stad !== undefined) out.provincie = provincieVoor(i.stad);
  if (i.behandelingen !== undefined) out.behandelingen = splitBehandelingen(i.behandelingen);
  if (i.volgende_opvolging_op !== undefined) {
    if (i.volgende_opvolging_op && Number.isNaN(Date.parse(i.volgende_opvolging_op))) throw new CrmError("Ongeldige opvolgdatum.");
    out.volgende_opvolging_op = i.volgende_opvolging_op || null;
  }
  return out;
}

const dupMessage = (e: unknown) => (e instanceof Error && /duplicate key/.test(e.message) ? new CrmError("Er bestaat al een lead met dit telefoonnummer of e-mailadres.", 409) : e);

export async function updateContact(user: CrmUser, id: string, input: ContactInput) {
  const c = await getContact(id);
  const alleenOpvolging = Object.keys(input).every((k) => k === "volgende_opvolging_op" || k === "tags");
  if (!magOutbound(c, user) && !(alleenOpvolging && user.rol !== "setter")) throw new CrmError("Deze lead is van een andere setter.", 403);
  const data = cleanInput(input);
  if (input.tags !== undefined) data.tags = cleanTags(input.tags);
  if (input.niet_benaderen !== undefined) {
    data.niet_benaderen = !!input.niet_benaderen;
    data.niet_benaderen_reden = input.niet_benaderen ? input.niet_benaderen_reden?.trim() || "Op verzoek" : null;
    if (input.niet_benaderen) data.volgende_opvolging_op = null;
  }
  if (input.eigenaar_id !== undefined) {
    if (user.rol !== "admin") throw new CrmError("Alleen de admin wijst leads toe.", 403);
    data.eigenaar_id = input.eigenaar_id || null;
    if (input.eigenaar_id && !c.oorspronkelijke_setter_id) data.oorspronkelijke_setter_id = input.eigenaar_id;
  }
  try {
    check(await db().from("crm_contacts").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id));
  } catch (e) {
    throw dupMessage(e);
  }
  if (input.eigenaar_id !== undefined) {
    await log({ contact_id: id, ...actor(user), type: "eigenaar", van: c.eigenaar_id, naar: input.eigenaar_id || null, tekst: "Eigenaar aangepast (commissie van eerdere boekingen blijft ongewijzigd)" });
  } else if (input.niet_benaderen !== undefined) {
    await log({ contact_id: id, ...actor(user), type: "gegevens", tekst: input.niet_benaderen ? `Niet meer benaderen: ${data.niet_benaderen_reden}` : "Mag weer benaderd worden" });
  } else if (input.volgende_opvolging_op !== undefined && Object.keys(input).length === 1) {
    await log({ contact_id: id, ...actor(user), type: "opvolging", tekst: input.volgende_opvolging_op ? `Opvolgen op ${new Date(input.volgende_opvolging_op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}` : "Opvolgmoment verwijderd" });
  } else if (input.tags !== undefined && Object.keys(input).length === 1) {
    await log({ contact_id: id, ...actor(user), type: "gegevens", tekst: `Tags: ${(data.tags as string[]).join(", ") || "geen"}` });
  } else {
    await log({ contact_id: id, ...actor(user), type: "gegevens", tekst: "Gegevens aangepast" });
  }
}

export async function createContact(user: CrmUser, input: ContactInput) {
  if (user.rol === "sales") throw new CrmError("Salesmedewerkers voegen geen outbound-leads toe.", 403);
  const data = cleanInput({ ...input, salon_naam: input.salon_naam ?? "" });
  let c: { id: string };
  try {
    c = check(
      await db()
        .from("crm_contacts")
        .insert({ ...data, crm_id: await huidigeCrmId(), bron: "handmatig", eigenaar_id: user.setter?.id ?? null, oorspronkelijke_setter_id: user.setter?.id ?? null })
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

// ---------- Taken en toestemming ----------

export async function addTask(user: CrmUser, contactId: string, titel: string, vervaltOp: string | null) {
  const c = await getContact(contactId);
  if (!titel.trim()) throw new CrmError("Geef de taak een titel.");
  if (vervaltOp && Number.isNaN(Date.parse(vervaltOp))) throw new CrmError("Ongeldige datum.");
  check(await db().from("crm_tasks").insert({ contact_id: c.id, titel: titel.trim().slice(0, 300), vervalt_op: vervaltOp || null, toegewezen_aan: user.setter?.id ?? c.eigenaar_id, door: user.email }));
  await log({ contact_id: c.id, ...actor(user), type: "taak", tekst: `Taak: ${titel.trim()}` });
}

export async function completeTask(user: CrmUser, taskId: string, gedaan: boolean) {
  const t = check(await db().from("crm_tasks").select("id, contact_id, titel, toegewezen_aan").eq("id", taskId).maybeSingle()) as { id: string; contact_id: string; titel: string; toegewezen_aan: string | null } | null;
  if (!t) throw new CrmError("Onbekende taak.", 404);
  if (user.rol !== "admin" && t.toegewezen_aan && t.toegewezen_aan !== user.setter.id) throw new CrmError("Deze taak is van iemand anders.", 403);
  check(await db().from("crm_tasks").update({ gedaan_op: gedaan ? new Date().toISOString() : null }).eq("id", t.id));
  await log({ contact_id: t.contact_id, ...actor(user), type: "taak", tekst: `${gedaan ? "Afgerond" : "Heropend"}: ${t.titel}` });
}

export async function addConsent(user: CrmUser, contactId: string, kanaal: string, status: "gegeven" | "ingetrokken", bron: string, categorie = "marketing") {
  if (!["whatsapp", "sms", "email", "bellen"].includes(kanaal)) throw new CrmError("Onbekend kanaal.");
  if (!bron.trim()) throw new CrmError("Geef aan hoe de toestemming is verkregen.");
  await getContact(contactId);
  check(await db().from("crm_consents").insert({ contact_id: contactId, kanaal, status, bron: bron.trim().slice(0, 300), categorie, vastgelegd_door: user.email }));
  await log({ contact_id: contactId, ...actor(user), type: "toestemming", tekst: `Toestemming ${kanaal} (${categorie}) ${status}: ${bron.trim()}` });
}

// ---------- Import ----------

/** Importeert leads (Google Sheet-link of CSV-tekst). Bestaande leads worden overgeslagen; twijfelgevallen komen in Beoordelen. */
export async function importLeads(user: CrmUser, bron: { url?: string; csv?: string; bestandsnaam?: string }) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin importeert.", 403);
  let leads: ImportLead[];
  let overgeslagen: { tab: string; reden: string }[] = [];
  let bronNaam: string;
  if (bron.csv) {
    const r = parseLeadRows(parseCsv(bron.csv), "csv");
    if (r.reden) throw new CrmError(`CSV niet herkend: ${r.reden}.`);
    leads = r.leads;
    bronNaam = "csv";
  } else {
    const id = extractSpreadsheetId(bron.url ?? "");
    if (!id) throw new CrmError("Geen geldige Google Sheet-link.");
    try {
      ({ leads, overgeslagen } = parseLeadSheet(await fetchSpreadsheet(id, env("GOOGLE_API_KEY"))));
    } catch (e) {
      throw new CrmError(e instanceof SheetFetchError ? e.message : "De sheet kon niet worden gelezen.");
    }
    bronNaam = "sheet";
  }
  const { uniek, dubbel } = dedupeLeads(leads);
  const crm = await huidigeCrmId();

  const bestaande = await all<{ id: string; salon_naam: string; stad: string | null; telefoon_norm: string | null; email: string | null; domein: string | null }>((f, t) =>
    db().from("crm_contacts").select("id, salon_naam, stad, telefoon_norm, email, domein").eq("crm_id", crm).order("id").range(f, t),
  );
  const tel = new Set(bestaande.map((b) => b.telefoon_norm).filter(Boolean));
  const mail = new Set(bestaande.map((b) => b.email).filter(Boolean));
  const dom = new Map(bestaande.filter((b) => b.domein).map((b) => [b.domein!, b.id]));
  const naam = new Map(bestaande.map((b) => [naamSleutel(b), b.id]));

  const nieuw: ImportLead[] = [];
  const twijfel: { lead: ImportLead; ander: string; reden: string }[] = [];
  let bestaand = 0;
  for (const l of uniek) {
    // Telefoon is leidend; zonder telefoon telt een bekend e-mailadres als bestaand.
    if ((l.telefoon_norm && tel.has(l.telefoon_norm)) || (!l.telefoon_norm && l.email && mail.has(l.email))) {
      bestaand++;
      continue;
    }
    // Ander nummer maar e-mail al in gebruik (keten met gedeeld adres): e-mail niet dubbel opslaan.
    if (l.email && mail.has(l.email)) {
      l.notitie = [l.notitie, `E-mail ${l.email} wordt ook door een andere vestiging gebruikt.`].filter(Boolean).join("\n");
      l.email = null;
    }
    if (l.email) mail.add(l.email);
    if (l.telefoon_norm) tel.add(l.telefoon_norm);
    const zelfdeDomein = l.domein ? dom.get(l.domein) : undefined;
    const zelfdeNaam = naam.get(naamSleutel(l));
    if (zelfdeDomein || zelfdeNaam) twijfel.push({ lead: l, ander: (zelfdeDomein ?? zelfdeNaam)!, reden: zelfdeDomein ? `zelfde website (${l.domein})` : "zelfde naam en plaats, ander nummer" });
    nieuw.push(l);
  }

  let toegevoegd = 0;
  const perFase: Record<string, number> = {};
  const idVoor = new Map<ImportLead, string>();
  const nu = new Date().toISOString();
  const herkomst = `Geïmporteerd (${bron.bestandsnaam ?? bronNaam})`;
  for (let k = 0; k < nieuw.length; k += 200) {
    const blok = nieuw.slice(k, k + 200);
    const fases = blok.map((l) => {
      const f = faseUitStatus(l.status, l.notitie);
      return l.rood && f !== "klant" ? "niet_benaderen" : f;
    });
    const ins = (check(
      await db()
        .from("crm_contacts")
        .insert(
          blok.map(({ status: _s, notitie: _n, rood, ...l }, i) => ({
            ...l,
            crm_id: crm,
            bron: bronNaam,
            belpogingen: fases[i] === "nieuw" ? 0 : 1,
            niet_benaderen: fases[i] === "niet_benaderen" || !!rood,
            niet_benaderen_reden: rood ? "Rood gemarkeerd in de leadlijst" : fases[i] === "niet_benaderen" ? "Volgens de lijst" : null,
            tags: rood ? ["Geen contact opnemen"] : [],
          })),
        )
        .select("id"),
    ) ?? []) as { id: string }[];
    ins.forEach((c, i) => idVoor.set(blok[i], c.id));
    check(await db().from("crm_opportunities").insert(ins.map((c, i) => ({ contact_id: c.id, pijplijn: "outbound", fase: fases[i], fase_sinds: nu }))));
    const ingepland = ins.filter((_, i) => fases[i] === "ingepland" && !blok[i].rood);
    if (ingepland.length) check(await db().from("crm_opportunities").insert(ingepland.map((c) => ({ contact_id: c.id, pijplijn: "sales", fase: "ingepland", fase_sinds: nu }))));
    const acts: Record<string, unknown>[] = [];
    ins.forEach((c, i) => {
      const l = blok[i];
      acts.push({ contact_id: c.id, door: user.email, type: "import", tekst: herkomst });
      if (l.status) acts.push({ contact_id: c.id, door: user.email, type: "fase", pijplijn: "outbound", van: null, naar: fases[i], tekst: `Status uit de lijst: ${l.status.trim()}` });
      if (fases[i] === "ingepland") acts.push({ contact_id: c.id, door: user.email, type: "fase", pijplijn: "sales", van: null, naar: "ingepland", tekst: "Eerder ingepland volgens de lijst (geen Calendly-afspraak gekoppeld)" });
      if (l.notitie?.trim()) acts.push({ contact_id: c.id, door: user.email, type: "notitie", tekst: `[Uit de lijst] ${l.notitie.trim()}` });
      perFase[fases[i]] = (perFase[fases[i]] ?? 0) + 1;
    });
    for (let j = 0; j < acts.length; j += 500) check(await db().from("crm_activities").insert(acts.slice(j, j + 500)));
    toegevoegd += ins.length;
  }
  if (twijfel.length) {
    check(
      await db()
        .from("crm_review")
        .insert(twijfel.map((t) => ({ soort: "duplicaat", contact_id: idVoor.get(t.lead), ander_contact_id: t.ander, info: { reden: t.reden } }))),
    );
  }
  return { toegevoegd, bestaand, dubbel, twijfel: twijfel.length, perFase, overgeslagen, zonderTelefoon: nieuw.filter((l) => !l.telefoon_norm).length, zonderProvincie: nieuw.filter((l) => !l.provincie).length };
}

// ---------- Beoordelen ----------

export async function reviewItems() {
  return (check(
    await db()
      .from("crm_review")
      .select(`id, soort, info, created_at, appointment_id, contact:crm_contacts!crm_review_contact_id_fkey(id, salon_naam, stad, telefoon, website), ander:crm_contacts!crm_review_ander_contact_id_fkey(id, salon_naam, stad, telefoon, website)`)
      .eq("status", "open")
      .order("created_at"),
  ) ?? []) as unknown as {
    id: string;
    soort: string;
    info: Record<string, unknown>;
    created_at: string;
    appointment_id: string | null;
    contact: { id: string; salon_naam: string; stad: string | null; telefoon: string | null; website: string | null } | null;
    ander: { id: string; salon_naam: string; stad: string | null; telefoon: string | null; website: string | null } | null;
  }[];
}

/** Duplicaat: 'samenvoegen' verwijdert de nieuwe (geïmporteerde) lead als die nog geen activiteit heeft; 'houden' laat beide staan. */
export async function resolveDuplicate(user: CrmUser, reviewId: string, keuze: "samenvoegen" | "houden") {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
  const r = check(await db().from("crm_review").select("id, contact_id, ander_contact_id, soort, status").eq("id", reviewId).maybeSingle()) as {
    id: string;
    contact_id: string | null;
    ander_contact_id: string | null;
    soort: string;
    status: string;
  } | null;
  if (!r || r.status !== "open" || r.soort !== "duplicaat") throw new CrmError("Niet gevonden.", 404);
  if (keuze === "samenvoegen" && r.contact_id) {
    const n = check(await db().from("crm_activities").select("id").eq("contact_id", r.contact_id).neq("type", "import")) as { id: string }[];
    const calls = check(await db().from("crm_calls").select("id").eq("contact_id", r.contact_id)) as { id: string }[];
    if (n.length || calls.length) throw new CrmError("Deze lead heeft al activiteit. Verwijder hem niet automatisch; pas hem handmatig aan.");
    check(await db().from("crm_review").update({ status: "opgelost", opgelost_door: user.email }).eq("id", r.id));
    check(await db().from("crm_contacts").delete().eq("id", r.contact_id));
    if (r.ander_contact_id) await log({ contact_id: r.ander_contact_id, ...actor(user), type: "gegevens", tekst: "Dubbele import samengevoegd met deze lead" });
    return;
  }
  check(await db().from("crm_review").update({ status: "opgelost", opgelost_door: user.email }).eq("id", r.id));
}

// ---------- Cijfers ----------

export interface SetterStats {
  setterId: string;
  naam: string;
  toegewezen: number;
  belpogingen: number;
  bereikt: number;
  opvolgtaken: number;
  gepland: number;
  verschenen: number;
  noShow: number;
  geannuleerd: number;
  gewonnen: number;
  gewonnenCents: number;
}

/** Tellingen per setter in een periode [start, eind) op datumniveau (Europe/Amsterdam). */
export async function stats(start: string, eind: string, user: CrmUser) {
  const van = amsterdamMidnight(start);
  const tot = amsterdamMidnight(eind);
  const crm = await huidigeCrmId();
  const [setters, contacts, calls, appts, deals, taken] = await Promise.all([
    acqSetters(),
    all<{ eigenaar_id: string | null }>((f, t) => db().from("crm_contacts").select("eigenaar_id").eq("crm_id", crm).not("eigenaar_id", "is", null).order("id").range(f, t)),
    all<{ setter_id: string | null; uitkomst: string | null }>((f, t) => db().from("crm_calls").select("setter_id, uitkomst, contact:crm_contacts!inner(crm_id)").eq("contact.crm_id", crm).gte("gestart_op", van).lt("gestart_op", tot).order("id").range(f, t)),
    all<{ setter_id: string | null; status: string; type: string; start_op: string; created_at: string }>((f, t) =>
      db().from("crm_appointments").select("setter_id, status, type, start_op, created_at, contact:crm_contacts!inner(crm_id)").eq("contact.crm_id", crm).gte("start_op", van).lt("start_op", tot).order("id").range(f, t),
    ),
    all<{ setter_id: string | null; waarde_cents: number | null; sluitdatum: string }>((f, t) =>
      db().from("crm_opportunities").select("setter_id, waarde_cents, sluitdatum, contact:crm_contacts!inner(crm_id)").eq("contact.crm_id", crm).eq("pijplijn", "sales").eq("fase", "geaccepteerd").gte("sluitdatum", start).lt("sluitdatum", eind).order("id").range(f, t),
    ),
    all<{ toegewezen_aan: string | null }>((f, t) => db().from("crm_tasks").select("toegewezen_aan, contact:crm_contacts!inner(crm_id)").eq("contact.crm_id", crm).is("gedaan_op", null).order("id").range(f, t)),
  ]);
  const NIET_BEREIKT = new Set(["niet_opgenomen", "ongeldig_nummer"]);
  const rijen: SetterStats[] = setters
    .filter((s) => s.rol === "setter")
    .filter((s) => user.rol === "admin" || s.id === user.setter?.id)
    .map((s) => {
      const c = calls.filter((x) => x.setter_id === s.id);
      const a = appts.filter((x) => x.setter_id === s.id && x.type === "kennismaking");
      const d = deals.filter((x) => x.setter_id === s.id);
      return {
        setterId: s.id,
        naam: s.naam,
        toegewezen: contacts.filter((x) => x.eigenaar_id === s.id).length,
        belpogingen: c.length,
        bereikt: c.filter((x) => x.uitkomst && !NIET_BEREIKT.has(x.uitkomst)).length,
        opvolgtaken: taken.filter((x) => x.toegewezen_aan === s.id).length,
        gepland: a.filter((x) => x.status !== "verplaatst").length,
        verschenen: a.filter((x) => x.status === "verschenen").length,
        noShow: a.filter((x) => x.status === "no_show").length,
        geannuleerd: a.filter((x) => x.status === "geannuleerd").length,
        gewonnen: d.length,
        gewonnenCents: d.reduce((sum, x) => sum + (x.waarde_cents ?? 0), 0),
      };
    });

  const pijplijn = {} as Record<Pijplijn, { fase: string; label: string; aantal: number; waardeCents: number }[]>;
  for (const p of ["outbound", "sales"] as Pijplijn[]) {
    const opps = (await loadCards(p, user)).filter((c) => p === "sales" || user.rol === "admin" || c.contact.eigenaar_id === user.setter?.id);
    pijplijn[p] = FASES[p].map((f) => ({
      fase: f.key,
      label: faseLabel(p, f.key),
      aantal: opps.filter((o) => o.fase === f.key).length,
      waardeCents: opps.filter((o) => o.fase === f.key).reduce((s, o) => s + (o.waarde_cents ?? 0), 0),
    }));
  }
  return { rijen, pijplijn };
}

export { BELBAAR };
