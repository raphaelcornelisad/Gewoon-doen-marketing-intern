import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/session";
import { effectiveCounts, validateCorrection, type Correction } from "@/lib/corrections";
import type { Counts } from "@/lib/sheets/types";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { id } = await params;
  const v = validateCorrection((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!v.ok) return NextResponse.json(v, { status: 422 });

  const sb = db();
  const { data: s, error } = await sb.from("submissions").select("status, counts_json, corrections_json").eq("id", id).maybeSingle();
  if (error || !s) return NextResponse.json({ ok: false, message: "Indiening niet gevonden." }, { status: 404 });
  if (s.status !== "te_controleren") {
    return NextResponse.json({ ok: false, message: "Alleen een indiening die nog gecontroleerd moet worden kan worden gecorrigeerd." }, { status: 409 });
  }
  const list = (s.corrections_json ?? []) as Correction[];
  const huidig = effectiveCounts((s.counts_json as { totaal: Counts }).totaal, list);
  const correctie: Correction = { at: new Date().toISOString(), veld: v.veld, oud: huidig[v.veld], nieuw: v.nieuw, opmerking: v.opmerking, door: admin.email };
  const { error: e2 } = await sb.from("submissions").update({ corrections_json: [...list, correctie] }).eq("id", id).eq("status", "te_controleren");
  if (e2) return NextResponse.json({ ok: false, message: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Correctie opgeslagen." });
}
