import { NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm/server";
import { tokenVoor, twilioStatus } from "@/lib/crm/twilio";

export const dynamic = "force-dynamic";

/** Token voor bellen in de browser. Identiteit = setter-ID (gecontroleerd in /api/twilio/voice). */
export async function GET() {
  const user = await getCrmUser();
  if (!user || user.rol !== "setter") return NextResponse.json({ ok: false }, { status: 401 });
  if (!twilioStatus().voice) return NextResponse.json({ ok: false, message: "Bellen via Twilio is nog niet aangesloten." }, { status: 503 });
  return NextResponse.json({ ok: true, token: tokenVoor(user.setter.id) });
}
