import { NextResponse } from "next/server";
import { crmRoute } from "@/lib/crm/api";
import { CrmError, getCrmUser } from "@/lib/crm/server";
import { dienIn, huidigeSessie, pauzeer, startSessie } from "@/lib/crm/sessies";

export const dynamic = "force-dynamic";

/** Lopende belsessie met live tellers. */
export async function GET() {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.rol !== "setter") return NextResponse.json({ ok: true, sessie: null });
  return NextResponse.json({ ok: true, sessie: await huidigeSessie(user) });
}

export async function POST(req: Request) {
  return crmRoute<{ actie?: string; notitie?: string }>(req, async (user, b) => {
    if (b.actie === "start") return { sessie: await startSessie(user) };
    if (b.actie === "pauze") return { sessie: await pauzeer(user, true) };
    if (b.actie === "hervat") return { sessie: await pauzeer(user, false) };
    if (b.actie === "indienen") return { samenvatting: await dienIn(user, String(b.notitie ?? "")) };
    throw new CrmError("Onbekende actie.");
  });
}
