import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/session";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { aan } = (await req.json().catch(() => ({}))) as { aan?: boolean };
  if (typeof aan !== "boolean") return NextResponse.json({ ok: false, message: "Ongeldig verzoek." }, { status: 400 });
  const { error } = await db().from("settings").update({ clinic_mail_test_mode: aan }).eq("id", 1);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, aan });
}
