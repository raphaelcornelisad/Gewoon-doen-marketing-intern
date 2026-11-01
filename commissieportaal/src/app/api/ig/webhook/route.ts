import { after, NextResponse } from "next/server";
import { verwerkWebhook } from "@/lib/ig/webhook-server";
import { handtekeningKlopt, webhookChallenge, type MetaWebhook } from "@/lib/ig/webhook";

export const dynamic = "force-dynamic";

/** Verificatie door Meta bij het instellen van de webhook: hub.challenge terug als het verify-token klopt. */
export async function GET(req: Request) {
  const challenge = webhookChallenge(new URL(req.url).searchParams, process.env.IG_WEBHOOK_VERIFY_TOKEN);
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/**
 * Instagram-berichten in realtime (velden messages en message_echoes).
 * Zonder geldige X-Hub-Signature-256 wordt niets geschreven (401). Alleen lezen richting Instagram.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!handtekeningKlopt(raw, req.headers.get("x-hub-signature-256"), process.env.IG_APP_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: MetaWebhook;
  try {
    body = JSON.parse(raw) as MetaWebhook;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const r = await verwerkWebhook(raw, body);
    // Gebruikersnamen opzoeken na het antwoord, zodat Meta binnen 2 seconden een 200 krijgt.
    try {
      after(r.nabewerking);
    } catch {
      await r.nabewerking(); // buiten een request-scope (tests)
    }
    return NextResponse.json({ ok: true, status: r.status, berichten: r.berichten });
  } catch (e) {
    console.error("Instagram-webhook mislukt", e);
    // Geen 200: Meta probeert het later opnieuw; de verwerking is idempotent.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
