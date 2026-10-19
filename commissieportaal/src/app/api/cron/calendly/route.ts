import { NextResponse } from "next/server";
import { syncCalendly } from "@/lib/acquisitie/server";
import { linkCalendly } from "@/lib/crm/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Elk uur: afspraken uit Calendly bijwerken (nieuw, verzet, geannuleerd, no-show). */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const sync = await syncCalendly();
    const crm = await linkCalendly();
    return NextResponse.json({ ok: true, ...sync, crm });
  } catch (e) {
    console.error("Calendly-sync mislukt", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
