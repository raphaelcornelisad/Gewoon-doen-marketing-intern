import { berichtStatus } from "@/lib/crm/berichten";
import { leesTwilio } from "@/lib/crm/twilio-route";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { geldig, p } = await leesTwilio(req);
  if (!geldig) return new Response("Ongeldige handtekening", { status: 403 });
  await berichtStatus(p.MessageSid, p.MessageStatus, p.ErrorCode);
  return new Response(null, { status: 204 });
}
