import { leesTwilio } from "@/lib/crm/twilio-route";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Providerstatus van de oproep (los van de menselijke uitkomst die de setter kiest). */
export async function POST(req: Request) {
  const { geldig, p, q } = await leesTwilio(req);
  if (!geldig) return new Response("Ongeldige handtekening", { status: 403 });
  const upd: Record<string, unknown> = { provider_status: p.CallStatus };
  if (p.CallStatus === "completed" && p.CallDuration) upd.duur_sec = Number(p.CallDuration);
  await db().from("crm_calls").update(upd).eq("id", q.get("callId") ?? "");
  return new Response(null, { status: 204 });
}
