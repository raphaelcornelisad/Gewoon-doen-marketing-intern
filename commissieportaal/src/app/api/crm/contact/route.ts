import { crmRoute } from "@/lib/crm/api";
import { createContact, type ContactInput } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<ContactInput>(req, async (user, b) => ({ id: await createContact(user, b) }));
}
