import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { fetchSpreadsheet } from "@/lib/sheets/fetch";
import { submitSheet } from "@/lib/submissions/submit";
import { supabaseSubmissionStore } from "@/lib/submissions/supabase-store";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Ongeldig verzoek." }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : "");

  try {
    const result = await submitSheet(
      { naam: str(body.naam), email: str(body.email), sheetUrl: str(body.sheetUrl) },
      {
        store: supabaseSubmissionStore(db()),
        fetchSheet: (id) => fetchSpreadsheet(id, env("GOOGLE_API_KEY")),
      },
    );
    if (!result.ok) {
      const status = result.code === "al_goedgekeurd" ? 409 : 422;
      return NextResponse.json({ ok: false, message: result.message, field: result.field }, { status });
    }
    // Geen bedragen of tellingen naar de setter.
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Indienen mislukt", e);
    return NextResponse.json(
      { ok: false, message: "Er ging iets mis bij het opslaan. Probeer het over een paar minuten opnieuw." },
      { status: 500 },
    );
  }
}
