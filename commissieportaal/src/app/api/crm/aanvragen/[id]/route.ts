import { crmRoute } from "@/lib/crm/api";
import { beoordeel } from "@/lib/crm/aanvragen";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ goed?: boolean; rol?: string }>(req, async (user, b) => {
    await beoordeel(user, id, !!b.goed, b.rol);
    return { message: b.goed ? "Goedgekeurd: de gebruiker kan nu inloggen." : "Afgewezen." };
  }, { beheer: true });
}
