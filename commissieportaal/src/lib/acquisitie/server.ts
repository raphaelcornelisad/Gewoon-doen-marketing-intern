import "server-only";
import { env } from "../env";
import { db } from "../supabase/server";
import { calculateStatement, clientsForSetter, groupClients, type AcqSettings, type AcqStatement, type Client, type Close, type Meeting } from "./calc";
import { toMeetingRow, type CalendlyEvent, type CalendlyInvitee } from "./calendly-map";
import { amsterdamDate } from "./period";
import type { PeriodRange } from "../period";

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export interface AcqSetter {
  id: string;
  naam: string;
  email: string;
  utm_source: string;
  start_datum: string;
  actief: boolean;
}

interface SettingsRow {
  base_fee_cents: number;
  per_verschenen_cents: number;
  bonus_drempel: number;
  bonus_cents: number;
  close_percentage: number;
  event_naam: string;
  laatste_sync: string | null;
}

export async function acqSettings(): Promise<{ calc: AcqSettings; eventNaam: string; laatsteSync: string | null }> {
  const s = check(await db().from("acq_settings").select("*").eq("id", 1).single()) as SettingsRow;
  return {
    calc: {
      baseFeeCents: s.base_fee_cents,
      perVerschenenCents: s.per_verschenen_cents,
      bonusDrempel: s.bonus_drempel,
      bonusCents: s.bonus_cents,
      closePercentage: Number(s.close_percentage),
    },
    eventNaam: s.event_naam,
    laatsteSync: s.laatste_sync,
  };
}

export async function acqSetters(): Promise<AcqSetter[]> {
  return (check(await db().from("acq_setters").select("*").order("naam")) ?? []) as AcqSetter[];
}

export async function acqSetterByEmail(email: string): Promise<AcqSetter | null> {
  return check(await db().from("acq_setters").select("*").eq("email", email.trim().toLowerCase()).eq("actief", true).maybeSingle()) as AcqSetter | null;
}

// ---------- Calendly ----------

async function calendly<T>(url: string): Promise<T> {
  const full = url.startsWith("http") ? url : `https://api.calendly.com${url}`;
  const res = await fetch(full, { headers: { Authorization: `Bearer ${env("CALENDLY_TOKEN")}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/**
 * Haalt afspraken van het ingestelde evenement op vanaf `sinds` (standaard 60 dagen terug,
 * zodat late no-show-markeringen en annuleringen meekomen) en werkt de database bij.
 */
export async function syncCalendly(sindsDagen = 60): Promise<{ events: number; invitees: number }> {
  const { eventNaam } = await acqSettings();
  const me = await calendly<{ resource: { uri: string } }>("/users/me");
  const min = new Date(Date.now() - sindsDagen * 86400000).toISOString();
  let next: string | null =
    `/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&min_start_time=${encodeURIComponent(min)}&count=100&sort=start_time:asc`;
  const events: CalendlyEvent[] = [];
  while (next) {
    const page: { collection: CalendlyEvent[]; pagination: { next_page: string | null } } = await calendly(next);
    events.push(...page.collection.filter((e) => e.name.trim() === eventNaam.trim()));
    next = page.pagination.next_page;
  }

  const rows = [];
  for (const e of events) {
    const inv = await calendly<{ collection: CalendlyInvitee[] }>(`${e.uri}/invitees?count=100`);
    for (const i of inv.collection) rows.push({ ...toMeetingRow(e, i), raw: { event: e, invitee: i }, synced_at: new Date().toISOString() });
  }
  for (let k = 0; k < rows.length; k += 200) {
    check(await db().from("acq_meetings").upsert(rows.slice(k, k + 200), { onConflict: "invitee_uri" }));
  }
  check(await db().from("acq_settings").update({ laatste_sync: new Date().toISOString() }).eq("id", 1));
  return { events: events.length, invitees: rows.length };
}

// ---------- Berekening ----------

async function allMeetings(eventNaam: string): Promise<Meeting[]> {
  const out: Meeting[] = [];
  for (let from = 0; ; from += 1000) {
    const page = (check(
      await db()
        .from("acq_meetings")
        .select("invitee_uri, start_time, status, no_show, email, phone, naam, utm_source, event_name")
        .eq("event_name", eventNaam)
        .order("start_time")
        .range(from, from + 999),
    ) ?? []) as {
      invitee_uri: string;
      start_time: string;
      status: "active" | "canceled";
      no_show: boolean;
      email: string | null;
      phone: string | null;
      naam: string;
      utm_source: string | null;
      event_name: string;
    }[];
    out.push(
      ...page.map((r) => ({
        id: r.invitee_uri,
        start: new Date(r.start_time).toISOString(),
        status: r.status,
        noShow: r.no_show,
        email: r.email,
        phone: r.phone,
        naam: r.naam,
        utmSource: r.utm_source,
        eventName: r.event_name,
      })),
    );
    if (page.length < 1000) break;
  }
  return out;
}

export interface CloseRow {
  client_key: string;
  setter_id: string;
  bedrag_cents: number;
  opmerking: string | null;
  gemarkeerd_op: string;
}

export interface SetterOverview {
  setter: AcqSetter;
  periode: PeriodRange;
  clients: Client[];
  statement: AcqStatement;
  closes: CloseRow[];
  goedgekeurd: { calc_json: AcqStatement; approved_at: string } | null;
  settings: AcqSettings;
  laatsteSync: string | null;
}

export { periodsFor } from "./period";

export async function setterOverview(setter: AcqSetter, periode: PeriodRange, now = new Date()): Promise<SetterOverview> {
  const { calc, eventNaam, laatsteSync } = await acqSettings();
  const meetings = await allMeetings(eventNaam);
  const clients = clientsForSetter(groupClients(meetings, now), setter.utm_source, setter.start_datum);
  const closes = (check(await db().from("acq_closes").select("*").eq("setter_id", setter.id)) ?? []) as CloseRow[];
  const closeList: Close[] = closes.map((c) => ({ clientKey: c.client_key, bedragCents: c.bedrag_cents, gemarkeerdOp: c.gemarkeerd_op }));
  const statement = calculateStatement(clients, closeList, periode, calc, amsterdamDate);
  const goedgekeurd = check(
    await db().from("acq_statements").select("calc_json, approved_at").eq("setter_id", setter.id).eq("start", periode.start).maybeSingle(),
  ) as { calc_json: AcqStatement; approved_at: string } | null;
  return { setter, periode, clients, statement, closes, goedgekeurd, settings: calc, laatsteSync };
}

// ---------- Admin-acties ----------

export async function setClose(setterId: string, clientKey: string, bedragCents: number, opmerking: string | null) {
  check(
    await db()
      .from("acq_closes")
      .upsert({ client_key: clientKey, setter_id: setterId, bedrag_cents: bedragCents, opmerking, gemarkeerd_op: new Date().toISOString() }, { onConflict: "client_key" }),
  );
}

export async function removeClose(clientKey: string) {
  check(await db().from("acq_closes").delete().eq("client_key", clientKey));
}

export async function approveStatement(setter: AcqSetter, periode: PeriodRange) {
  const o = await setterOverview(setter, periode);
  if (o.goedgekeurd) return { ok: false, message: "Deze periode is al goedgekeurd." };
  // Alleen wat nodig is voor de afrekening; geen volledige klantdata.
  const calc = {
    ...o.statement,
    verschenen: o.statement.verschenen.map((c) => ({ key: c.key, naam: c.naam, verschenenOp: c.verschenenOp })),
  };
  check(await db().from("acq_statements").insert({ setter_id: setter.id, start: periode.start, eind: periode.eind, calc_json: calc }));
  return { ok: true, message: "Goedgekeurd." };
}
