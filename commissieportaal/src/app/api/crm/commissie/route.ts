import { crmRoute } from "@/lib/crm/api";
import { betaalUit, herbereken, keurGoed } from "@/lib/crm/grootboek";
import { CrmError } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ actie?: string; setterId?: string; periode?: string }>(req, async (user, b) => {
    if (user.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
    if (b.actie === "herbereken") return { message: `${(await herbereken(user.email)).acties} wijzigingen verwerkt.` };
    if (!b.setterId || !b.periode || !/^\d{4}-\d{2}-\d{2}$/.test(b.periode)) throw new CrmError("Kies setter en periode.");
    if (b.actie === "goedkeuren") return { message: `${await keurGoed(b.setterId, b.periode, user.email)} regels goedgekeurd.` };
    if (b.actie === "uitbetalen") {
      const t = await betaalUit(b.setterId, b.periode, user.email);
      return { message: t ? `Uitbetaald: € ${(t / 100).toFixed(2).replace(".", ",")}` : "Geen goedgekeurde regels om uit te betalen." };
    }
    throw new CrmError("Onbekende actie.");
  }, { beheer: true });
}
