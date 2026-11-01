import "server-only";
import { all, check, CrmError, type CrmUser } from "../crm/server";
import { db } from "../supabase/server";
import { isIgFase } from "./core";
import { draagOverAanSales, type OverdrachtStatus } from "./overdracht";
import type { IgSyncPayload } from "./schema";
import { voorlopigGesprekId } from "./webhook";

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
export async function zetIgFase(user: CrmUser, threadId: string, fase: string): Promise<{ overdracht?: OverdrachtStatus | "mislukt" }> {
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
  if (fase !== "call_geboekt") return {};
  // Call geboekt → sales (alleen met IG_SALES_OVERDRACHT=aan). De fase is al opgeslagen; een fout hier maakt die niet ongedaan.
  try {
    return { overdracht: (await draagOverAanSales(threadId, user.email, user.setter?.id ?? null)).status };
  } catch (e) {
    console.error("Instagram-overdracht naar sales mislukt", e);
    return { overdracht: "mislukt" };
  }
}

/** Klantlabel: een bestaande klant telt niet als lead. Alleen de admin zet het. */
export async function zetBestaandeKlant(user: CrmUser, threadId: string, waarde: boolean) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin kan het klantlabel aanpassen.", 403);
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw new CrmError("Gesprek niet gevonden.", 404);
  const r = await db().from("ig_threads").update({ bestaande_klant: waarde, updated_at: new Date().toISOString() }).eq("id", threadId).select("id").maybeSingle();
  if (!check(r)) throw new CrmError("Gesprek niet gevonden.", 404);
}

/**
 * Een gesprek dat de webhook eerder zag dan de sync heeft een voorlopig id (igsid:<lead>).
 * Zodra de sync het echte gesprek-id meestuurt, neemt dat het over, zodat er geen dubbele kaart ontstaat.
 */
async function neemVoorlopigeOver(p: IgSyncPayload) {
  const metLead = p.threads.filter((t) => t.lead_ig_id && !t.ig_conversation_id.startsWith("igsid:"));
  if (!metLead.length) return;
  const acc = check(await db().from("ig_accounts").select("id").eq("ig_user_id", p.account.ig_user_id).maybeSingle()) as { id: string } | null;
  if (!acc) return;
  const voorlopig = (check(
    await db().from("ig_threads").select("id, ig_conversation_id").eq("account_id", acc.id).in("ig_conversation_id", metLead.map((t) => voorlopigGesprekId(t.lead_ig_id!))),
  ) ?? []) as { id: string; ig_conversation_id: string }[];
  for (const v of voorlopig) {
    const echt = metLead.find((t) => voorlopigGesprekId(t.lead_ig_id!) === v.ig_conversation_id)!.ig_conversation_id;
    const bestaat = check(await db().from("ig_threads").select("id").eq("account_id", acc.id).eq("ig_conversation_id", echt).maybeSingle());
    if (!bestaat) await db().from("ig_threads").update({ ig_conversation_id: echt, updated_at: new Date().toISOString() }).eq("id", v.id);
  }
}

/** Gesprekken die het brein op Call geboekt zette: doorzetten naar sales (als de overdracht aan staat). */
async function breinOverdracht(accountId: string, p: IgSyncPayload) {
  const conv = p.threads.filter((t) => t.fase === "call_geboekt").map((t) => t.ig_conversation_id);
  if (!conv.length) return;
  const rows = (check(
    await db().from("ig_threads").select("id").eq("account_id", accountId).eq("fase", "call_geboekt").is("contact_id", null).in("ig_conversation_id", conv),
  ) ?? []) as { id: string }[];
  for (const r of rows) {
    try {
      await draagOverAanSales(r.id, "brein", null);
    } catch (e) {
      console.error("Instagram-overdracht naar sales mislukt", e);
    }
  }
}

/** Eén sync-batch van de box wegschrijven en loggen in ig_sync_runs. */
export async function igSync(p: IgSyncPayload) {
  await neemVoorlopigeOver(p);
  const run = check(await db().from("ig_sync_runs").insert({ gestart_op: new Date().toISOString() }).select("id").single()) as { id: string };
  const r = await db().rpc("ig_sync", { p });
  if (r.error) {
    await db().from("ig_sync_runs").update({ klaar_op: new Date().toISOString(), fouten: 1, fout: r.error.message.slice(0, 1000) }).eq("id", run.id);
    throw new Error(r.error.message);
  }
  const res = r.data as { account_id: string; gesprekken: number; berichten_nieuw: number; dagen: number };
  await breinOverdracht(res.account_id, p);
  await db().from("ig_sync_runs").update({ klaar_op: new Date().toISOString(), gesprekken: res.gesprekken, berichten_nieuw: res.berichten_nieuw }).eq("id", run.id);
  return { run: run.id, ...res };
}
