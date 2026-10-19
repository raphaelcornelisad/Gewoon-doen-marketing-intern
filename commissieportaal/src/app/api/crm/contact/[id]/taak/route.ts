import { crmRoute } from "@/lib/crm/api";
import { addTask } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ titel?: string; vervaltOp?: string | null }>(req, async (user, b) => {
    await addTask(user, id, String(b.titel ?? ""), b.vervaltOp ?? null);
  });
}
