import { crmRoute } from "@/lib/crm/api";
import { maakBoekingslink } from "@/lib/crm/calendly";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ contactId?: string; type?: string }>(req, async (user, b) => maakBoekingslink(user, String(b.contactId), b.type === "salesgesprek" ? "salesgesprek" : "kennismaking"));
}
