import { NextResponse } from "next/server";
import { syncCalendly } from "@/lib/acquisitie/server";
import { getAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  if (!(await getAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  try {
    const r = await syncCalendly();
    return NextResponse.json({ ok: true, message: `Bijgewerkt: ${r.invitees} afspraken uit Calendly.` });
  } catch (e) {
    console.error("Calendly-sync mislukt", e);
    return NextResponse.json({ ok: false, message: "Ophalen uit Calendly is mislukt." }, { status: 500 });
  }
}
