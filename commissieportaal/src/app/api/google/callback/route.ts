import { after, NextResponse } from "next/server";
import { leesState, rondKoppelingAf, synchroniseerOpenstaand } from "@/lib/crm/google";
import { getCrmUser } from "@/lib/crm/server";
import { env } from "@/lib/env";

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
  after(() => synchroniseerOpenstaand(setterId));
  return terug("ok=1");
}
