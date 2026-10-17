import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Dagelijkse lichte query, zodat het (gratis) Supabase-project niet wordt gepauzeerd. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { error } = await db().from("settings").select("id").eq("id", 1).maybeSingle();
  return NextResponse.json({ ok: !error });
}
