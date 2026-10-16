import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildMonthlyMail } from "@/lib/mail/monthly";
import { sendMail } from "@/lib/mail/resend";
import { amsterdamParts, PERIOD_DAY, periodForSubmission } from "@/lib/period";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron draait in UTC, op de 14e om 07:00 én 08:00. Alleen de run die in
 * Amsterdam om 09:00 valt, verstuurt (zomer- en wintertijd). Elke mail wordt
 * gelogd in mail_log, zodat niemand hem twee keer krijgt.
 * ?force=1 slaat de tijdcheck over (handmatig testen), de dubbel-check blijft.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const { day, hour } = amsterdamParts(now);
  if (!force && (day !== PERIOD_DAY || hour !== 9)) {
    return NextResponse.json({ ok: true, skipped: `Amsterdam ${day}e ${hour}:00` });
  }

  const periode = periodForSubmission(now);
  const sb = db();
  const { data: setters, error } = await sb.from("setters").select("naam, email").eq("actief", true);
  if (error) throw new Error(error.message);
  const { data: sentRows } = await sb
    .from("mail_log")
    .select("email")
    .eq("kind", "maandmail")
    .eq("period_key", periode.eind);
  const sent = new Set((sentRows ?? []).map((r) => String(r.email).toLowerCase()));

  const result = { verstuurd: [] as string[], overgeslagen: [] as string[], mislukt: [] as string[] };
  for (const s of setters ?? []) {
    const email = String(s.email).toLowerCase();
    if (sent.has(email)) {
      result.overgeslagen.push(email);
      continue;
    }
    try {
      await sendMail({ to: email, ...buildMonthlyMail(s.naam, email, periode, env("APP_URL")) });
      await sb.from("mail_log").insert({ kind: "maandmail", period_key: periode.eind, email });
      result.verstuurd.push(email);
    } catch (e) {
      console.error("Maandmail mislukt", email, e);
      result.mislukt.push(email);
    }
  }
  return NextResponse.json({ ok: true, periode: periode.label, ...result });
}
