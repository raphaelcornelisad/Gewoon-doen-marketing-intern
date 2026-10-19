import { crmRoute } from "@/lib/crm/api";
import { updateContact, type ContactInput } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<ContactInput>(req, async (user, b) => {
    await updateContact(user, id, b);
    return { message: "Opgeslagen." };
  });
}
