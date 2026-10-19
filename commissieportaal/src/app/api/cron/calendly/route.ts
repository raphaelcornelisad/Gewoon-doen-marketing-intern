import { NextResponse } from "next/server";
import { herverwerkMislukt, syncCalendlyCrm } from "@/lib/crm/calendly";
import { herbereken } from "@/lib/crm/grootboek";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Elk uur: mislukte webhooks opnieuw, gemiste Calendly-updates herstellen, grootboek bijwerken. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) return NextResponse.json({ ok: false }, { status: 401 });
  const h = await herverwerkMislukt().catch((e) => ({ fout: String(e) }));
  const s = await syncCalendlyCrm().catch((e) => ({ fout: e instanceof Error ? e.message : String(e) }));
  const g = await herbereken().catch((e) => ({ fout: String(e) }));
  return NextResponse.json({ ok: true, herverwerkt: h, sync: s, grootboek: g });
}
