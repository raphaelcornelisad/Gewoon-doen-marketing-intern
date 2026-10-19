import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio-webhookcontrole: X-Twilio-Signature = base64(HMAC-SHA1(authToken, url + gesorteerde key+value van de POST-velden)).
 */
export function geldigTwilio(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const verwacht = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(verwacht);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/** Access token voor de Twilio Voice JS SDK (bellen in de browser). */
export function voiceToken(o: { accountSid: string; apiKeySid: string; apiKeySecret: string; appSid: string; identity: string; ttl?: number; nu?: number }) {
  const now = Math.floor((o.nu ?? Date.now()) / 1000);
  const header = { alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${o.apiKeySid}-${now}`,
    iss: o.apiKeySid,
    sub: o.accountSid,
    iat: now,
    exp: now + (o.ttl ?? 3600),
    grants: { identity: o.identity, voice: { incoming: { allow: false }, outgoing: { application_sid: o.appSid } } },
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${body}.${b64url(createHmac("sha256", o.apiKeySecret).update(body).digest())}`;
}

/** Minimale TwiML-escaping. */
export const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
