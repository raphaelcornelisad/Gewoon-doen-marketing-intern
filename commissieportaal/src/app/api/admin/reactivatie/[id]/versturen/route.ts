import { NextResponse } from "next/server";
import { getBeheerAdmin } from "@/lib/auth/beheer";
import { campaignLists, sendReactList } from "@/lib/reactivatie/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** id = campagne; body.listId = één lijst, anders alle nog niet verstuurde lijsten. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getBeheerAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { id } = await params;
  const { listId } = (await req.json().catch(() => ({}))) as { listId?: string };
  const lists = (await campaignLists(id)).filter((l) => (listId ? l.id === listId : !l.sent_at));
  const resultaat: string[] = [];
  for (const l of lists) {
    try {
      const r = await sendReactList(l.id);
      resultaat.push(r.ok ? `${l.clinic.naam}: verstuurd naar ${r.to}` : `${l.clinic.naam}: ${r.reden}`);
    } catch (e) {
      console.error("Versturen reactivatielijst mislukt", l.id, e);
      resultaat.push(`${l.clinic.naam}: versturen mislukt`);
    }
  }
  return NextResponse.json({ ok: true, message: resultaat.length ? resultaat.join("\n") : "Niets te versturen." });
}
