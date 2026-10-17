import { NextResponse } from "next/server";
import { removeClose, setClose } from "@/lib/acquisitie/server";
import { getAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { setterId?: string; clientKey?: string; bedrag?: string | number | null; opmerking?: string };
  if (!b.setterId || !b.clientKey) return NextResponse.json({ ok: false, message: "Ongeldig verzoek." }, { status: 400 });
  if (b.bedrag === null || b.bedrag === "") {
    await removeClose(b.clientKey);
    return NextResponse.json({ ok: true, message: "Close verwijderd." });
  }
  const euro = Number(String(b.bedrag).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(euro) || euro <= 0 || euro > 10_000_000) {
    return NextResponse.json({ ok: false, message: "Vul een geldig bedrag in, bijv. 3000 of 2.500,50." }, { status: 422 });
  }
  await setClose(b.setterId, b.clientKey, Math.round(euro * 100), b.opmerking?.trim() || null);
  return NextResponse.json({ ok: true, message: "Close opgeslagen." });
}
