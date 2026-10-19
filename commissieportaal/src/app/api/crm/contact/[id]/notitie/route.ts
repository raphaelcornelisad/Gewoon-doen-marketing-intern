import { crmRoute } from "@/lib/crm/api";
import { addNote } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ tekst?: string }>(req, async (user, b) => {
    await addNote(user, id, String(b.tekst ?? ""));
  });
}
