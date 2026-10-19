import { crmRoute } from "@/lib/crm/api";
import { completeTask } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ gedaan?: boolean }>(req, async (user, b) => {
    await completeTask(user, id, b.gedaan !== false);
  });
}
