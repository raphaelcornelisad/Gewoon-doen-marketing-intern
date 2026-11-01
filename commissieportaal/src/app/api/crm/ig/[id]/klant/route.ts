import { crmRoute } from "@/lib/crm/api";
import { CrmError } from "@/lib/crm/server";
import { zetBestaandeKlant } from "@/lib/ig/server";

export const dynamic = "force-dynamic";

/** Klantlabel aan of uit op een Instagram-gesprek (alleen admin). Een bestaande klant telt niet als lead. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ bestaande_klant?: unknown }>(req, async (user, b) => {
    if (typeof b.bestaande_klant !== "boolean") throw new CrmError("Geef bestaande_klant op (waar of onwaar).");
    await zetBestaandeKlant(user, id, b.bestaande_klant);
  });
}
