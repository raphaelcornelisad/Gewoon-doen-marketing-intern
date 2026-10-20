import { crmRoute } from "@/lib/crm/api";
import { slaGebruikerOp, slaInstellingenOp, slaScriptOp, slaTemplateOp, webhookAanzetten } from "@/lib/crm/instellingen";
import { CrmError } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return crmRoute<{ soort?: string; data?: any }>(req, async (user, b) => {
    switch (b.soort) {
      case "instellingen":
        await slaInstellingenOp(user, b.data ?? {});
        return { message: "Instellingen opgeslagen." };
      case "webhook":
        return { message: `Calendly-webhook actief: ${await webhookAanzetten(user)}` };
      case "script":
        await slaScriptOp(user, b.data);
        return { message: "Script opgeslagen." };
      case "template":
        await slaTemplateOp(user, b.data);
        return { message: "Template opgeslagen." };
      case "gebruiker":
        await slaGebruikerOp(user, b.data);
        return { message: "Gebruiker opgeslagen." };
      default:
        throw new CrmError("Onbekende instelling.");
    }
  }, { beheer: true });
}
