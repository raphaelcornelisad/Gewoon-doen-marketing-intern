import { crmRoute } from "@/lib/crm/api";
import { zetAfspraakStatus } from "@/lib/crm/calendly";
import { CrmError } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ status?: string }>(req, async (user, b) => {
    if (b.status !== "verschenen" && b.status !== "no_show" && b.status !== "gepland") throw new CrmError("Onbekende status.");
    await zetAfspraakStatus(user, id, b.status);
  });
}
