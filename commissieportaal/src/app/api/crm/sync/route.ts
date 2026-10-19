import { syncCalendly } from "@/lib/acquisitie/server";
import { crmRoute } from "@/lib/crm/api";
import { CrmError, linkCalendly } from "@/lib/crm/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  return crmRoute(req, async (user) => {
    if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
    await syncCalendly();
    const r = await linkCalendly();
    return { message: `Calendly bijgewerkt: ${r.gekoppeld} afspraken gekoppeld, ${r.aangemaakt} nieuwe leads.` };
  });
}
