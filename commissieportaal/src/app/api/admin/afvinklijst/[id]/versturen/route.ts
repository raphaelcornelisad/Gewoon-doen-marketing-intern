import { NextResponse } from "next/server";
import { getBeheerAdmin } from "@/lib/auth/beheer";
import { sendChecklist } from "@/lib/opkomst/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getBeheerAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { id } = await params;
  const { periode } = (await req.json().catch(() => ({}))) as { periode?: string };
  try {
    const r = await sendChecklist(id, periode ?? "");
    return NextResponse.json(r.ok ? { ok: true, message: `Verstuurd naar ${r.to}` } : { ok: false, message: r.reden }, { status: r.ok ? 200 : 422 });
  } catch (e) {
    console.error("Versturen afvinklijst mislukt", id, e);
    return NextResponse.json({ ok: false, message: "Versturen mislukt." }, { status: 500 });
  }
}
