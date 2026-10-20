import { crmRoute } from "@/lib/crm/api";
import { koppelBoeking, koppelSetter } from "@/lib/crm/calendly";
import { CrmError, resolveDuplicate } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return crmRoute<{ actie?: string; setterId?: string | null; contactId?: string }>(req, async (user, b) => {
    switch (b.actie) {
      case "samenvoegen":
      case "houden":
        return void (await resolveDuplicate(user, id, b.actie));
      case "setter":
        return void (await koppelSetter(user, id, b.setterId || null));
      case "koppelen":
        return void (await koppelBoeking(user, id, { contactId: b.contactId, setterId: b.setterId || null }));
      case "nieuw":
        return void (await koppelBoeking(user, id, { nieuw: true, setterId: b.setterId || null }));
      case "negeren":
        return void (await koppelBoeking(user, id, { negeren: true, setterId: null }));
      default:
        throw new CrmError("Onbekende actie.");
    }
  }, { beheer: true });
}
