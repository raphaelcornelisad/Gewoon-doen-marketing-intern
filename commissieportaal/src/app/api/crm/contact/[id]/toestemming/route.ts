import { crmRoute } from "@/lib/crm/api";
import { addConsent } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ kanaal?: string; status?: "gegeven" | "ingetrokken"; bron?: string; categorie?: string }>(req, async (user, b) => {
    await addConsent(user, id, String(b.kanaal), b.status === "ingetrokken" ? "ingetrokken" : "gegeven", String(b.bron ?? ""), b.categorie === "service" ? "service" : "marketing");
  });
}
