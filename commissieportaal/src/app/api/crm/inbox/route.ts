import { markeerGelezen } from "@/lib/crm/berichten";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ contactId?: string }>(req, async (user, b) => {
    await markeerGelezen(user, String(b.contactId));
  });
}
