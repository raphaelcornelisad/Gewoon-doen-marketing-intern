import { NextResponse } from "next/server";
import { approveStatement, acqSetters, periodsFor } from "@/lib/acquisitie/server";
import { getAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { setterId, start } = (await req.json().catch(() => ({}))) as { setterId?: string; start?: string };
  const setter = (await acqSetters()).find((s) => s.id === setterId);
  const periode = setter ? periodsFor(setter).find((p) => p.start === start) : undefined;
  if (!setter || !periode) return NextResponse.json({ ok: false, message: "Onbekende setter of periode." }, { status: 400 });
  const r = await approveStatement(setter, periode);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
