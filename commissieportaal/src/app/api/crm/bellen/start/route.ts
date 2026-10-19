import { startOproep } from "@/lib/crm/bellen";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ contactId?: string }>(req, async (user, b) => startOproep(user, String(b.contactId)));
}
