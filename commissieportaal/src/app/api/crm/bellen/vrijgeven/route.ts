import { geefVrij, reserveer } from "@/lib/crm/bellen";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

/** body.reserveren = true reserveert; anders vrijgeven. */
export async function POST(req: Request) {
  return crmRoute<{ contactId?: string; reserveren?: boolean }>(req, async (user, b) => {
    if (b.reserveren) await reserveer(user, String(b.contactId));
    else await geefVrij(user, String(b.contactId));
  });
}
