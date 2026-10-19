import { corrigeerAnalyse } from "@/lib/crm/analyse";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ samenvatting?: string; vervolgstap?: string | null; bezwaren?: { categorie: string; citaat: string; tijdstip_sec: number }[] }>(req, async (user, b) => {
    await corrigeerAnalyse(user, id, b);
  });
}
