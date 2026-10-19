import "server-only";
import { env } from "../env";
import { authToken } from "./twilio";
import { geldigTwilio } from "./twilio-sign";

/** Leest een Twilio-webhook en controleert de handtekening tegen de publieke URL. */
export async function leesTwilio(req: Request): Promise<{ geldig: boolean; p: Record<string, string>; q: URLSearchParams }> {
  const form = await req.formData();
  const p: Record<string, string> = {};
  form.forEach((v, k) => (p[k] = String(v)));
  const u = new URL(req.url);
  const publiek = `${env("APP_URL").replace(/\/$/, "")}${u.pathname}${u.search}`;
  const tok = authToken();
  return { geldig: !!tok && geldigTwilio(tok, publiek, p, req.headers.get("x-twilio-signature")), p, q: u.searchParams };
}

export const twiml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml" } });
