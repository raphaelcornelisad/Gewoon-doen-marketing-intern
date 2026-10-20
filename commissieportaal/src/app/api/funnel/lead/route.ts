import { NextResponse } from "next/server";
import { normPhone } from "@/lib/crm/core";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FUNNELS = new Set(["uvacare"]);
const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Aanvraag uit een salonfunnel (pop-up voor de boekingspagina). Openbaar, dus streng gevalideerd. */
export async function POST(req: Request) {
  const tekst = await req.text();
  if (tekst.length > 5000) return NextResponse.json({ ok: false }, { status: 413 });
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(tekst) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const pagina = s(d.pagina, 500);
  const funnel = pagina.match(/\/f\/([a-z0-9-]+)\//)?.[1] ?? (/uvacare/i.test(pagina) ? "uvacare" : "");
  const voornaam = s(d.voornaam, 80);
  const email = s(d.email, 160).toLowerCase();
  const telefoon = s(d.telefoon, 40);
  if (!FUNNELS.has(funnel) || !voornaam || (!email && !telefoon) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { error } = await db().from("funnel_leads").insert({
    salon: s(d.salon, 120) || funnel,
    funnel,
    voornaam,
    achternaam: s(d.achternaam, 80) || null,
    email: email || null,
    telefoon: telefoon || null,
    telefoon_norm: normPhone(telefoon.replace(/\s+/g, "")),
    aanbod: s(d.aanbod, 200) || null,
    pagina: pagina || null,
    akkoord: d.akkoord_voorwaarden === true,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  if (error) {
    console.error("Funnel-lead opslaan mislukt", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
