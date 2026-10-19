import { logHandmatig, verstuur } from "@/lib/crm/berichten";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ contactId?: string; kanaal?: string; tekst?: string; templateId?: string | null; handmatig?: boolean }>(req, async (user, b) => {
    const kanaal = b.kanaal === "sms" ? "sms" : "whatsapp";
    if (b.handmatig) await logHandmatig(user, String(b.contactId), kanaal, String(b.tekst ?? ""));
    else await verstuur(user, String(b.contactId), kanaal, String(b.tekst ?? ""), b.templateId || null);
    return { message: b.handmatig ? "Vastgelegd als handmatig verstuurd." : "Aangeboden aan de provider. De status volgt." };
  });
}
