import { NextResponse } from "next/server";
import { saveReactAnswers } from "@/lib/reactivatie/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { antwoorden?: Record<string, unknown>; indienen?: boolean } | null;
  if (!body || typeof body.antwoorden !== "object" || body.antwoorden === null) {
    return NextResponse.json({ ok: false, message: "Ongeldig verzoek." }, { status: 400 });
  }
  try {
    const r = await saveReactAnswers(token, body.antwoorden, body.indienen === true);
    return NextResponse.json(r, { status: r.status });
  } catch (e) {
    console.error("Opslaan reactivatielijst mislukt", e);
    return NextResponse.json({ ok: false, message: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
