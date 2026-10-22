import { NextResponse } from "next/server";
import { acqSetters } from "@/lib/acquisitie/server";
import { crmRoute } from "@/lib/crm/api";
import { addNote, contactDetail, getCrmUser } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

/** Alle notities van een lead (los en bij belpogingen), nieuwste boven. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const [d, setters] = await Promise.all([contactDetail(id, user), acqSetters()]);
  if (!d) return NextResponse.json({ ok: false, message: "Lead niet gevonden." }, { status: 404 });
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const wie = (setterId: string | null, door: string | null) => (setterId ? (naam.get(setterId) ?? door ?? "") : door === "admin" || !door ? "Admin" : door.split("@")[0]);
  const notities = [
    ...d.activiteit.filter((a) => a.type === "notitie" && a.tekst).map((a) => ({ id: a.id, tekst: a.tekst!.replace(/^\[Uit de lijst\]\s*/, ""), wie: wie(a.setter_id, a.door), op: a.created_at })),
    ...d.calls.filter((c) => c.notitie).map((c) => ({ id: `call-${c.id}`, tekst: c.notitie!, wie: wie(c.setter_id, c.door), op: c.gestart_op, bron: "bij gesprek" })),
  ].sort((a, b) => b.op.localeCompare(a.op));
  return NextResponse.json({ ok: true, notities });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ tekst?: string }>(req, async (user, b) => {
    await addNote(user, id, String(b.tekst ?? ""));
  });
}
