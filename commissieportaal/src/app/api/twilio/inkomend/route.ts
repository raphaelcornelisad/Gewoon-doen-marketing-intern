import { inkomend } from "@/lib/crm/berichten";
import { leesTwilio, twiml } from "@/lib/crm/twilio-route";

export const dynamic = "force-dynamic";

/** Inkomende sms/WhatsApp (in Twilio instellen als "A message comes in"-webhook). */
export async function POST(req: Request) {
  const { geldig, p } = await leesTwilio(req);
  if (!geldig) return new Response("Ongeldige handtekening", { status: 403 });
  try {
    await inkomend({ sid: p.MessageSid, van: p.From, tekst: p.Body ?? "", kanaal: p.From?.startsWith("whatsapp:") ? "whatsapp" : "sms" });
  } catch (e) {
    console.error("Inkomend bericht mislukt", e);
    return new Response("Fout", { status: 500 });
  }
  return twiml("");
}
