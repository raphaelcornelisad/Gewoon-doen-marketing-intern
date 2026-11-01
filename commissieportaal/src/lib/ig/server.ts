import "server-only";
import { all, check, CrmError, type CrmUser } from "../crm/server";
import { db } from "../supabase/server";
import { isIgFase } from "./core";
import type { IgSyncPayload } from "./schema";

export interface IgThreadRow {
  id: string;
  ig_conversation_id: string;
  lead_gebruikersnaam: string | null;
  fase: string;
  fase_bron: string;
  fase_sinds: string;
  laatste_bericht_op: string | null;
  laatste_van: string | null;
  laatste_tekst: string | null;
  wacht_op_ons_sinds: string | null;
  bestaande_klant: boolean;
  contact_id: string | null;
}

const THREAD_COLS =
  "id, ig_conversation_id, lead_gebruikersnaam, fase, fase_bron, fase_sinds, laatste_bericht_op, laatste_van, laatste_tekst, wacht_op_ons_sinds, bestaande_klant, contact_id";

/** Wie de Instagram-pijplijn mag aanpassen. Sales mag kijken. */
export const magIgBewerken = (u: CrmUser) => u.rol === "admin" || u.rol === "setter";

/** Gesprekken voor het bord: zonder intern en spam. */
export async function igThreads(): Promise<IgThreadRow[]> {
  return all<IgThreadRow>((f, t) =>
    db()
      .from("ig_threads")
      .select(THREAD_COLS)
      .eq("intern", false)
      .eq("is_spam", false)
      .not("fase", "in", "(intern,spam)")
      .order("laatste_bericht_op", { ascending: false, nullsFirst: false })
      .order("id")
      .range(f, t),
  );
}

export type IgDag = Record<string, number | string | null> & { rapportdag: string; berekend_op: string };

/** Cijfers van de laatste rapportdag (of null als er nog niets is). */
export async function laatsteIgDag(): Promise<IgDag | null> {
  const r = await db().from("ig_daily_metrics").select("*").order("rapportdag", { ascending: false }).limit(1).maybeSingle();
  return check(r) as IgDag | null;
}

/** Laatste sync-run, voor "laatste sync x min geleden". */
export async function laatsteIgSync(): Promise<{ gestart_op: string; klaar_op: string | null; fouten: number } | null> {
  const r = await db().from("ig_sync_runs").select("gestart_op, klaar_op, fouten").order("gestart_op", { ascending: false }).limit(1).maybeSingle();
  return check(r);
}

/** Fase handmatig zetten (slepen op het bord). Daarna overschrijft de sync deze fase niet meer. */
export async function zetIgFase(user: CrmUser, threadId: string, fase: string) {
  if (!magIgBewerken(user)) throw new CrmError("Je kunt de fase van Instagram-gesprekken niet aanpassen.", 403);
  if (!isIgFase(fase)) throw new CrmError("Onbekende fase.");
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw new CrmError("Gesprek niet gevonden.", 404);
  const r = await db()
    .from("ig_threads")
    .update({ fase, fase_bron: "handmatig", fase_sinds: new Date().toISOString(), fase_door: user.email, updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .select("id")
    .maybeSingle();
  if (!check(r)) throw new CrmError("Gesprek niet gevonden.", 404);
  // TODO(handoff, wacht op akkoord): bij fase "call_geboekt" de lead doorzetten naar CRM Sales, fase "ingepland"
  // (crm_contacts + ensureSales). Bewust nog niet gebouwd: er worden geen salescontacten automatisch aangemaakt.
}

/** Eén sync-batch van de box wegschrijven en loggen in ig_sync_runs. */
export async function igSync(p: IgSyncPayload) {
  const run = check(await db().from("ig_sync_runs").insert({ gestart_op: new Date().toISOString() }).select("id").single()) as { id: string };
  const r = await db().rpc("ig_sync", { p });
  if (r.error) {
    await db().from("ig_sync_runs").update({ klaar_op: new Date().toISOString(), fouten: 1, fout: r.error.message.slice(0, 1000) }).eq("id", run.id);
    throw new Error(r.error.message);
  }
  const res = r.data as { gesprekken: number; berichten_nieuw: number; dagen: number };
  await db().from("ig_sync_runs").update({ klaar_op: new Date().toISOString(), gesprekken: res.gesprekken, berichten_nieuw: res.berichten_nieuw }).eq("id", run.id);
  return { run: run.id, ...res };
}
