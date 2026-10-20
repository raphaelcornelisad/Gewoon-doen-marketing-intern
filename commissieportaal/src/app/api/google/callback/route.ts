import { after, NextResponse } from "next/server";
import { leesState, rondKoppelingAf, syncOpvolging, syncTaak } from "@/lib/crm/google";
import { getCrmUser } from "@/lib/crm/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Terugkomst van Google: koppeling opslaan en bestaande toekomstige terugbelmomenten en taken in de agenda zetten. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const terug = (q: string) => NextResponse.redirect(`${env("APP_URL").replace(/\/$/, "")}/crm/koppelingen?${q}`);
  const user = await getCrmUser();
  const setterId = leesState(u.searchParams.get("state"));
  if (!user?.setter || !setterId || setterId !== user.setter.id) return terug("fout=ongeldig");
  if (u.searchParams.get("error") || !u.searchParams.get("code")) return terug("fout=geweigerd");
  try {
    await rondKoppelingAf(setterId, u.searchParams.get("code")!);
  } catch (x) {
    console.error("Google koppelen mislukt", x);
    return terug(`fout=${encodeURIComponent(x instanceof Error ? x.message : "mislukt")}`);
  }
  after(async () => {
    const nu = new Date().toISOString();
    const [{ data: leads }, { data: taken }] = await Promise.all([
      db().from("crm_contacts").select("id").eq("eigenaar_id", setterId).gt("volgende_opvolging_op", nu).limit(500),
      db().from("crm_tasks").select("id").eq("toegewezen_aan", setterId).is("gedaan_op", null).gt("vervalt_op", nu).limit(500),
    ]);
    for (const l of (leads ?? []) as { id: string }[]) await syncOpvolging(l.id);
    for (const t of (taken ?? []) as { id: string }[]) await syncTaak(t.id);
  });
  return terug("ok=1");
}
