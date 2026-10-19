import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ruimOpnamesOp } from "@/lib/crm/analyse";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Dagelijks: lichte query (Supabase niet pauzeren) en opnames ouder dan de bewaartermijn verwijderen. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { error } = await db().from("settings").select("id").eq("id", 1).maybeSingle();
  const opruimen = await ruimOpnamesOp().catch((e) => ({ fout: String(e) }));
  return NextResponse.json({ ok: !error, opruimen });
}
