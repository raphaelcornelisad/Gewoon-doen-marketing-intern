import { env } from "@/lib/env";
import { crmSettings } from "@/lib/crm/calendly";
import { callerId } from "@/lib/crm/twilio";
import { leesTwilio, twiml } from "@/lib/crm/twilio-route";
import { xml } from "@/lib/crm/twilio-sign";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * TwiML voor een uitgaande oproep vanuit de browser. Alleen toegestaan voor een open oproep van deze setter
 * naar het nummer van de gereserveerde lead (geen vrij nummer bellen), en niet bij niet-meer-benaderen.
 */
export async function POST(req: Request) {
  const { geldig, p } = await leesTwilio(req);
  if (!geldig) return new Response("Ongeldige handtekening", { status: 403 });
  const setter = p.From?.replace(/^client:/, "");
  const { data } = await db().from("crm_calls").select("id, setter_id, uitkomst, contact:crm_contacts!inner(telefoon_norm, niet_benaderen, gereserveerd_door)").eq("id", p.callId ?? "").maybeSingle();
  const c = data as unknown as { id: string; setter_id: string; uitkomst: string | null; contact: { telefoon_norm: string | null; niet_benaderen: boolean; gereserveerd_door: string | null } } | null;
  if (!c || c.setter_id !== setter || c.uitkomst || c.contact.niet_benaderen || c.contact.gereserveerd_door !== setter || !c.contact.telefoon_norm || c.contact.telefoon_norm !== p.To) {
    return twiml(`<Say language="nl-NL">Deze oproep is niet toegestaan.</Say><Hangup/>`);
  }
  // De klant ziet het eigen 06 van de setter (geverifieerd caller-ID in Twilio), anders het standaardnummer.
  const { data: s0 } = await db().from("acq_setters").select("beller_nummer").eq("id", setter).maybeSingle();
  const van = (s0 as { beller_nummer: string | null } | null)?.beller_nummer || callerId();
  if (!van) return twiml(`<Say language="nl-NL">Er is nog geen belnummer ingesteld.</Say><Hangup/>`);
  await db().from("crm_calls").update({ provider: "twilio", provider_sid: p.CallSid, provider_status: "initiated" }).eq("id", c.id);
  const s = await crmSettings();
  const base = env("APP_URL").replace(/\/$/, "");
  const opname = s.opnemen ? ` record="record-from-answer-dual" recordingStatusCallback="${base}/api/twilio/opname?callId=${c.id}" recordingStatusCallbackEvent="completed"` : "";
  const melding = s.opnemen ? ` url="${base}/api/twilio/melding"` : "";
  return twiml(
    `<Dial callerId="${xml(van)}" answerOnBridge="true" timeout="30"${opname}><Number${melding} statusCallback="${base}/api/twilio/status?callId=${c.id}" statusCallbackEvent="initiated ringing answered completed">${xml(c.contact.telefoon_norm)}</Number></Dial>`,
  );
}
