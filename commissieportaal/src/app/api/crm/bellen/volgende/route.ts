import { volgendeLead } from "@/lib/crm/bellen";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ overslaan?: string[] }>(req, async (user, b) => ({ contactId: await volgendeLead(user, Array.isArray(b.overslaan) ? b.overslaan : []) }));
}
