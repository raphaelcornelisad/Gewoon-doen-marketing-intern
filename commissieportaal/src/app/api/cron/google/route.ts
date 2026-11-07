import { NextResponse } from "next/server";
import { synchroniseerOpenstaand } from "@/lib/crm/google";
import { verwerkUitnodigingen } from "@/lib/crm/uitnodiging";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Elke 5 minuten: terugbelmomenten en taken die nog niet in Google Agenda staan alsnog zetten. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) return NextResponse.json({ ok: false }, { status: 401 });
  const uitnodigingen = await verwerkUitnodigingen().catch((e) => String(e));
  return NextResponse.json({ ok: true, uitnodigingen, ...(await synchroniseerOpenstaand()) });
}
