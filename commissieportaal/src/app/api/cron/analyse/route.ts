import { NextResponse } from "next/server";
import { verwerkAnalyses } from "@/lib/crm/analyse";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Elke 5 minuten: opnames transcriberen en analyseren. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await verwerkAnalyses()) });
}
