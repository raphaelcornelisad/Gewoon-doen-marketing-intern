import { NextResponse } from "next/server";
import { BEHEER_COOKIE, beheerCookie } from "@/lib/auth/beheer";
import { getAdmin } from "@/lib/auth/session";
import { controleerWachtwoord, hashWachtwoord, sterkGenoeg } from "@/lib/auth/wachtwoord";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_FOUTEN = 5;
const BLOK_MIN = 15;

/** Beheer ontgrendelen, (eerste keer) wachtwoord instellen, of vergrendelen. Alleen voor de ingelogde admin. */
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ ok: false, message: "Geen toegang." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { wachtwoord?: string; nieuw?: string; herhaal?: string; vergrendel?: boolean };

  if (b.vergrendel) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(BEHEER_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const { data } = await db().from("crm_settings").select("beheer_hash, beheer_fouten, beheer_blok_tot").eq("id", 1).single();
  const s = data as { beheer_hash: string | null; beheer_fouten: number; beheer_blok_tot: string | null };

  if (!s.beheer_hash) {
    // Eerste keer: wachtwoord instellen.
    const n = String(b.nieuw ?? "");
    if (!sterkGenoeg(n)) return NextResponse.json({ ok: false, message: "Kies een wachtwoord van minstens 10 tekens." }, { status: 422 });
    if (n !== b.herhaal) return NextResponse.json({ ok: false, message: "De wachtwoorden zijn niet gelijk." }, { status: 422 });
    await db().from("crm_settings").update({ beheer_hash: hashWachtwoord(n), beheer_fouten: 0, beheer_blok_tot: null }).eq("id", 1).is("beheer_hash", null);
  } else {
    if (s.beheer_blok_tot && new Date(s.beheer_blok_tot).getTime() > Date.now()) {
      return NextResponse.json({ ok: false, message: "Te veel foute pogingen. Probeer het over een kwartier opnieuw." }, { status: 429 });
    }
    if (!controleerWachtwoord(String(b.wachtwoord ?? ""), s.beheer_hash)) {
      const fouten = s.beheer_fouten + 1;
      await db()
        .from("crm_settings")
        .update(fouten >= MAX_FOUTEN ? { beheer_fouten: 0, beheer_blok_tot: new Date(Date.now() + BLOK_MIN * 60000).toISOString() } : { beheer_fouten: fouten })
        .eq("id", 1);
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ ok: false, message: fouten >= MAX_FOUTEN ? "Te veel foute pogingen. Beheer is 15 minuten geblokkeerd." : "Onjuist wachtwoord." }, { status: 401 });
    }
    await db().from("crm_settings").update({ beheer_fouten: 0, beheer_blok_tot: null }).eq("id", 1);
  }
  const res = NextResponse.json({ ok: true });
  const c = beheerCookie(admin.email);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
