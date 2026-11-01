import { crmRoute } from "@/lib/crm/api";
import { CrmError } from "@/lib/crm/server";
import { zetIgFase } from "@/lib/ig/server";

export const dynamic = "force-dynamic";

/** Fase van een Instagram-gesprek handmatig zetten (slepen op /crm/instagram). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ fase?: string }>(req, async (user, b) => {
    if (typeof b.fase !== "string") throw new CrmError("Geen fase opgegeven.");
    return zetIgFase(user, id, b.fase);
  });
}
