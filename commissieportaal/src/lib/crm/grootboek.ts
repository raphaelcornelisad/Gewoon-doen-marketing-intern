import "server-only";
import { amsterdamDate } from "../acquisitie/period";
import { db } from "../supabase/server";
import { gewenst, regelVersie, vergelijk, type AfspraakIn, type Bestaand, type DealIn, type Regels, type SetterIn } from "./commissie";

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

async function all<T>(q: (f: number, t: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const page = (check(await q(f, f + 999)) ?? []) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export async function regels(): Promise<Regels> {
  const s = check(await db().from("acq_settings").select("base_fee_cents, per_verschenen_cents, bonus_drempel, bonus_cents, close_percentage").eq("id", 1).single()) as {
    base_fee_cents: number;
    per_verschenen_cents: number;
    bonus_drempel: number;
    bonus_cents: number;
    close_percentage: number;
  };
  return { basisCents: s.base_fee_cents, showCents: s.per_verschenen_cents, bonusDrempel: s.bonus_drempel, bonusCents: s.bonus_cents, closePercentage: Number(s.close_percentage) };
}

const LEDGER_COLS = "id, sleutel, setter_id, soort, contact_id, opp_id, appointment_id, periode_start, datum, grondslag_cents, percentage, bedrag_cents, status, regel_versie, uitleg, gecorrigeerd_van, door, created_at, updated_at";
export type LedgerRow = Bestaand & { regel_versie: string; door: string; created_at: string; updated_at: string };

/**
 * Brengt het grootboek in lijn met de afspraken en deals. Veilig om vaak aan te roepen:
 * unieke sleutels voorkomen dubbele regels, ook bij herhaalde webhooks.
 */
export async function herbereken(door = "systeem") {
  const r = await regels();
  const versie = regelVersie(r);
  const [setters, afspraken, deals, bestaand] = await Promise.all([
    all<SetterIn>((f, t) => db().from("acq_setters").select("id, start_datum, actief, rol").order("id").range(f, t)),
    all<AfspraakIn>((f, t) => db().from("crm_appointments").select("id, contact_id, type, status, start_op, setter_id").order("id").range(f, t)),
    all<DealIn>((f, t) => db().from("crm_opportunities").select("id, contact_id, fase, waarde_cents, sluitdatum, setter_id").eq("pijplijn", "sales").order("id").range(f, t)),
    all<LedgerRow>((f, t) => db().from("commission_ledger").select(LEDGER_COLS).order("id").range(f, t)),
  ]);
  const vandaag = amsterdamDate(new Date().toISOString());
  const acties = vergelijk(bestaand, gewenst({ setters, afspraken, deals, regels: r, vandaag }), vandaag);
  const now = new Date().toISOString();
  for (const a of acties) {
    if (a.soort === "toevoegen" || a.soort === "correctie") {
      const rij = { ...a.regel, regel_versie: versie, door, gecorrigeerd_van: a.soort === "correctie" ? a.van : null };
      check(await db().from("commission_ledger").upsert(rij, { onConflict: "sleutel", ignoreDuplicates: true }));
      if (a.regel.contact_id) {
        await db().from("crm_activities").insert({ contact_id: a.regel.contact_id, door, setter_id: a.regel.setter_id, type: "commissie", tekst: `${a.soort === "correctie" ? "Correctie" : "Commissie"} ${a.regel.soort}: €${(a.regel.bedrag_cents / 100).toFixed(2).replace(".", ",")} · ${a.regel.uitleg}` });
      }
    } else if (a.soort === "vervallen") {
      check(await db().from("commission_ledger").update({ status: "vervallen", updated_at: now }).eq("id", a.id).in("status", ["verdiend", "goedgekeurd"]));
    } else {
      check(await db().from("commission_ledger").update({ status: "verdiend", updated_at: now }).eq("id", a.id).eq("status", "vervallen"));
    }
  }
  return { acties: acties.length };
}

export async function ledger(setterId: string | null, periodeStart?: string): Promise<LedgerRow[]> {
  return all<LedgerRow>((f, t) => {
    let q = db().from("commission_ledger").select(LEDGER_COLS);
    if (setterId) q = q.eq("setter_id", setterId);
    if (periodeStart) q = q.eq("periode_start", periodeStart);
    return q.order("datum").order("created_at").range(f, t);
  });
}

export function totalen(rows: LedgerRow[]) {
  const telt = rows.filter((r) => r.status !== "vervallen" && r.soort !== "uitbetaling");
  const som = (st: string[]) => telt.filter((r) => st.includes(r.status)).reduce((s, r) => s + r.bedrag_cents, 0);
  return { verdiend: som(["verdiend", "goedgekeurd", "uitbetaald"]), goedgekeurd: som(["goedgekeurd", "uitbetaald"]), uitbetaald: som(["uitbetaald"]), open: som(["verdiend"]) };
}

/** Admin: alle verdiende regels van een setter in een periode goedkeuren. */
export async function keurGoed(setterId: string, periodeStart: string, door: string) {
  await herbereken(door);
  const n = check(
    await db().from("commission_ledger").update({ status: "goedgekeurd", updated_at: new Date().toISOString() }).eq("setter_id", setterId).eq("periode_start", periodeStart).eq("status", "verdiend").select("id"),
  ) as { id: string }[];
  return n.length;
}

/** Admin: goedgekeurde regels als uitbetaald markeren; legt een uitbetalingsregel vast. */
export async function betaalUit(setterId: string, periodeStart: string, door: string) {
  const rows = check(
    await db().from("commission_ledger").update({ status: "uitbetaald", updated_at: new Date().toISOString() }).eq("setter_id", setterId).eq("periode_start", periodeStart).eq("status", "goedgekeurd").neq("soort", "uitbetaling").select("bedrag_cents"),
  ) as { bedrag_cents: number }[];
  if (!rows.length) return 0;
  const totaal = rows.reduce((s, r) => s + r.bedrag_cents, 0);
  const vandaag = amsterdamDate(new Date().toISOString());
  check(
    await db().from("commission_ledger").insert({
      setter_id: setterId,
      soort: "uitbetaling",
      sleutel: `uitbetaling:${setterId}:${periodeStart}:${Date.now()}`,
      periode_start: periodeStart,
      datum: vandaag,
      bedrag_cents: -totaal,
      status: "uitbetaald",
      regel_versie: "-",
      uitleg: `Uitbetaald: ${rows.length} regels`,
      door,
    }),
  );
  return totaal;
}
