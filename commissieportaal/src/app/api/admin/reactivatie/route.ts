import { NextResponse } from "next/server";
import { getBeheerAdmin } from "@/lib/auth/beheer";
import { createCampaign } from "@/lib/reactivatie/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await getBeheerAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { naam, links } = (await req.json().catch(() => ({}))) as { naam?: string; links?: string };
  const urls = (links ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return NextResponse.json({ ok: false, message: "Plak minstens één sheetlink." }, { status: 422 });
  try {
    const r = await createCampaign(naam?.trim() || "Reactivatie", urls.slice(0, 50));
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (e) {
    console.error("Reactivatie aanmaken mislukt", e);
    return NextResponse.json({ ok: false, message: "Aanmaken is mislukt." }, { status: 500 });
  }
}
