import "server-only";
import { voiceToken } from "./twilio-sign";

/**
 * Twilio (bellen in de browser, opnames, sms, WhatsApp Business Platform).
 * Alles is uitgeschakeld tot de omgevingsvariabelen in Vercel staan; de interface toont dan "wacht op aansluiting".
 */
const e = (k: string) => process.env[k]?.trim() || null;

export function twilioStatus() {
  const basis = !!(e("TWILIO_ACCOUNT_SID") && e("TWILIO_AUTH_TOKEN"));
  return {
    basis,
    voice: basis && !!(e("TWILIO_API_KEY_SID") && e("TWILIO_API_KEY_SECRET") && e("TWILIO_TWIML_APP_SID")),
    sms: basis && !!e("TWILIO_SMS_FROM"),
    whatsapp: basis && !!e("TWILIO_WHATSAPP_FROM"),
  };
}

const host = () => (e("TWILIO_REGION") ? `https://api.${e("TWILIO_REGION")}.twilio.com` : "https://api.twilio.com");
const auth = () => `Basic ${Buffer.from(`${e("TWILIO_ACCOUNT_SID")}:${e("TWILIO_AUTH_TOKEN")}`).toString("base64")}`;
export const authToken = () => e("TWILIO_AUTH_TOKEN");
/** Standaard belnummer als een setter nog geen eigen (geverifieerd) nummer heeft. */
export const callerId = () => e("TWILIO_CALLER_ID");

export function tokenVoor(identity: string) {
  if (!twilioStatus().voice) throw new Error("Twilio Voice is niet aangesloten.");
  return voiceToken({ accountSid: e("TWILIO_ACCOUNT_SID")!, apiKeySid: e("TWILIO_API_KEY_SID")!, apiKeySecret: e("TWILIO_API_KEY_SECRET")!, appSid: e("TWILIO_TWIML_APP_SID")!, identity });
}

export class TwilioFout extends Error {}

/** Verstuurt een sms of WhatsApp-bericht. Vrije tekst of goedgekeurde template (Content SID + variabelen). */
export async function verstuurBericht(o: { kanaal: "sms" | "whatsapp"; aan: string; tekst?: string; contentSid?: string; variabelen?: Record<string, string>; statusCallback: string }) {
  const from = o.kanaal === "whatsapp" ? `whatsapp:${e("TWILIO_WHATSAPP_FROM")}` : e("TWILIO_SMS_FROM")!;
  const body = new URLSearchParams({ From: from, To: o.kanaal === "whatsapp" ? `whatsapp:${o.aan}` : o.aan, StatusCallback: o.statusCallback });
  if (o.contentSid) {
    body.set("ContentSid", o.contentSid);
    if (o.variabelen) body.set("ContentVariables", JSON.stringify(o.variabelen));
  } else body.set("Body", o.tekst ?? "");
  const res = await fetch(`${host()}/2010-04-01/Accounts/${e("TWILIO_ACCOUNT_SID")}/Messages.json`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok || !data.sid) throw new TwilioFout(data.message ? `Twilio ${data.code ?? res.status}: ${data.message}` : `Twilio gaf fout ${res.status}`);
  return { sid: data.sid, status: data.status ?? "queued" };
}

/** Opname ophalen (Twilio-opnames vereisen authenticatie). */
export async function haalOpname(url: string) {
  const res = await fetch(url.endsWith(".mp3") ? url : `${url}.mp3`, { headers: { Authorization: auth() }, cache: "no-store" });
  if (!res.ok) throw new TwilioFout(`Opname niet beschikbaar (${res.status})`);
  return res;
}

export async function verwijderOpname(sid: string) {
  const res = await fetch(`${host()}/2010-04-01/Accounts/${e("TWILIO_ACCOUNT_SID")}/Recordings/${sid}.json`, { method: "DELETE", headers: { Authorization: auth() } });
  if (!res.ok && res.status !== 404) throw new TwilioFout(`Opname verwijderen mislukt (${res.status})`);
}
