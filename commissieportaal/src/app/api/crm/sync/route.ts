import { crmRoute } from "@/lib/crm/api";
import { herverwerkMislukt, syncCalendlyCrm } from "@/lib/crm/calendly";
import { CrmError } from "@/lib/crm/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  return crmRoute(req, async (user) => {
    if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
    const h = await herverwerkMislukt();
    const r = await syncCalendlyCrm();
    return { message: `Calendly gesynchroniseerd: ${r.invitees} afspraken gecontroleerd. Mislukte meldingen opnieuw: ${h.ok}/${h.geprobeerd}.` };
  }, { beheer: true });
}
