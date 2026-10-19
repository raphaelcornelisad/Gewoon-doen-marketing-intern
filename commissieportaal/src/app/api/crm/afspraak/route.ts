import { crmRoute } from "@/lib/crm/api";
import { handmatigeAfspraak } from "@/lib/crm/calendly";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ contactId?: string; type?: string; start?: string; setterId?: string | null }>(req, async (user, b) => {
    await handmatigeAfspraak(user, String(b.contactId), b.type === "salesgesprek" ? "salesgesprek" : "kennismaking", String(b.start), b.setterId || null);
  });
}
