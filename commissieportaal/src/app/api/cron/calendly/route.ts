import { NextResponse } from "next/server";
import { abonneerWebhook, crmSettings, herverwerkMislukt, syncCalendlyCrm } from "@/lib/crm/calendly";
import { herbereken } from "@/lib/crm/grootboek";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Elke 5 minuten: webhook aanzetten als die nog ontbreekt, mislukte meldingen opnieuw, nieuwe boekingen ophalen. Elk uur: 30 dagen terug. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) return NextResponse.json({ ok: false }, { status: 401 });
  const w = (await crmSettings()).calendly_webhook_uri ? "actief" : await abonneerWebhook().catch((e) => ({ fout: e instanceof Error ? e.message : String(e) }));
  const h = await herverwerkMislukt().catch((e) => ({ fout: String(e) }));
  const s = await syncCalendlyCrm(new Date().getUTCMinutes() < 5 ? 30 : 2).catch((e) => ({ fout: e instanceof Error ? e.message : String(e) }));
  const g = await herbereken().catch((e) => ({ fout: String(e) }));
  return NextResponse.json({ ok: true, webhook: w, herverwerkt: h, sync: s, grootboek: g });
}
