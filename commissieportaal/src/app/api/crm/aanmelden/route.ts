import { NextResponse } from "next/server";
import { vraagAan } from "@/lib/crm/aanvragen";
import { CrmError } from "@/lib/crm/server";

export const dynamic = "force-dynamic";
const OK = { ok: true, message: "Bedankt! Je aanvraag is ontvangen. Je krijgt een mail zodra je account is goedgekeurd." };

/** Openbaar: account aanvragen. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    await vraagAan(body, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);
    return NextResponse.json(OK);
  } catch (e) {
    if (e instanceof CrmError) return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    console.error("Accountaanvraag mislukt", e);
    return NextResponse.json({ ok: false, message: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
