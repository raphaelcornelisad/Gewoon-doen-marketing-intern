import { createHmac, timingSafeEqual } from "node:crypto";

/** Ondertekende sessiewaarde: base64url(payload).base64url(hmac). */
export interface SessionPayload {
  email: string;
  exp: number; // unix seconden
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signSession(p: SessionPayload, secret: string): string {
  const body = b64(JSON.stringify(p));
  const mac = createHmac("sha256", secret).update(body).digest();
  return `${body}.${b64(mac)}`;
}

export function verifySession(value: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof p.email !== "string" || typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    return p;
  } catch {
    return null;
  }
}

export const isAdminEmail = (email: string | null | undefined, adminEmail: string) =>
  !!email && email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
