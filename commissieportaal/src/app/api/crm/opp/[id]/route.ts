import { crmRoute } from "@/lib/crm/api";
import { parseEuro } from "@/lib/crm/core";
import { CrmError, moveOpp, setSalesSetter, setWaarde } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ fase?: string; waarde?: string | null; setterId?: string | null }>(req, async (user, b) => {
    if (typeof b.fase === "string") await moveOpp(user, id, b.fase);
    if (b.waarde !== undefined) {
      const cents = b.waarde === null || b.waarde.trim() === "" ? null : parseEuro(b.waarde);
      if (b.waarde !== null && b.waarde.trim() !== "" && cents === null) throw new CrmError("Ongeldig bedrag.");
      await setWaarde(user, id, cents);
    }
    if (b.setterId !== undefined) await setSalesSetter(user, id, b.setterId || null);
  });
}
