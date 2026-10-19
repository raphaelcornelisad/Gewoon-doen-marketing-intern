import { crmRoute } from "@/lib/crm/api";
import { parseEuro } from "@/lib/crm/core";
import { CrmError, moveOpp, setSalesSetter, setSluitdatum, setVerkoper, setWaarde } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

const euro = (v: unknown) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const c = parseEuro(String(v));
  if (c === null) throw new CrmError("Ongeldig bedrag.");
  return c;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ fase?: string; waarde?: string | null; sluitdatum?: string | null; offerte_op?: string | null; offerte?: string | null; setterId?: string | null; verkoperId?: string | null }>(req, async (user, b) => {
    if (typeof b.fase === "string") {
      await moveOpp(user, id, b.fase, {
        ...(b.waarde !== undefined ? { waarde_cents: euro(b.waarde) } : {}),
        ...(b.sluitdatum !== undefined ? { sluitdatum: b.sluitdatum } : {}),
        ...(b.offerte_op !== undefined ? { offerte_op: b.offerte_op } : {}),
        ...(b.offerte !== undefined ? { offerte_cents: euro(b.offerte) } : {}),
      });
      return;
    }
    if (b.waarde !== undefined) await setWaarde(user, id, euro(b.waarde));
    if (b.sluitdatum !== undefined) await setSluitdatum(user, id, b.sluitdatum || null);
    if (b.setterId !== undefined) await setSalesSetter(user, id, b.setterId || null);
    if (b.verkoperId !== undefined) await setVerkoper(user, id, b.verkoperId || null);
  });
}
