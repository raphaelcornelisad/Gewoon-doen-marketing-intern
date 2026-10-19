import { NextResponse } from "next/server";
import { ontvangWebhook } from "@/lib/crm/calendly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Calendly-webhook: handtekening controleren, idempotent opslaan, verwerken. Fouten → 500 zodat Calendly opnieuw probeert. */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const r = await ontvangWebhook(raw, req.headers.get("calendly-webhook-signature"));
    return NextResponse.json({ ok: r.status === 200 }, { status: r.status });
  } catch (e) {
    console.error("Calendly-webhook mislukt", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
