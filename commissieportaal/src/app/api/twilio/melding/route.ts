import { crmSettings } from "@/lib/crm/calendly";
import { leesTwilio, twiml } from "@/lib/crm/twilio-route";
import { xml } from "@/lib/crm/twilio-sign";

export const dynamic = "force-dynamic";

/** Opnamemelding voor de gebelde partij zodra die opneemt. */
export async function POST(req: Request) {
  const { geldig } = await leesTwilio(req);
  if (!geldig) return new Response("Ongeldige handtekening", { status: 403 });
  const s = await crmSettings();
  return twiml(`<Say language="nl-NL">${xml(s.opname_melding)}</Say>`);
}
