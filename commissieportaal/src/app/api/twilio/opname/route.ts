import { leesTwilio } from "@/lib/crm/twilio-route";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Opname klaar: koppelen aan de juiste oproep en in de wachtrij zetten voor transcriptie/analyse. */
export async function POST(req: Request) {
  const { geldig, p, q } = await leesTwilio(req);
  if (!geldig) return new Response("Ongeldige handtekening", { status: 403 });
  if (p.RecordingStatus && p.RecordingStatus !== "completed") return new Response(null, { status: 204 });
  await db()
    .from("crm_calls")
    .update({ opname_sid: p.RecordingSid, opname_url: p.RecordingUrl, opname_duur_sec: Number(p.RecordingDuration || 0), analyse_status: "wachtrij" })
    .eq("id", q.get("callId") ?? "")
    .eq("provider_sid", p.CallSid);
  return new Response(null, { status: 204 });
}
