import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/session";
import { setApprovedCount } from "@/lib/opkomst/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { attendanceId, aantal } = (await req.json().catch(() => ({}))) as { attendanceId?: string; aantal?: number | null };
  if (!attendanceId) return NextResponse.json({ ok: false, message: "Ongeldig verzoek." }, { status: 400 });
  const r = await setApprovedCount(attendanceId, aantal ?? null);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
