import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildChecklistItems } from "../attendance";
import { env } from "../env";
import { buildClinicMail } from "../mail/clinic";
import { sendMail } from "../mail/resend";
import type { ParseResult } from "../sheets/types";
import { db } from "../supabase/server";
import { tabMatches } from "./server";

export const VOORBEELD = "voorbeeld-";
const base = () => env("APP_URL").replace(/\/$/, "");
const GELDIG_DAGEN = 7;

// Ondertekende voorbeeldlink (7 dagen geldig): toont de echte afvinklijst, maar slaat niets op.
const teken = (s: string) => createHmac("sha256", `${env("ADMIN_SESSION_SECRET")}:kliniek-voorbeeld`).update(s).digest("base64url").slice(0, 32);
export function voorbeeldToken(clinicId: string) {
  const s = `${clinicId}.${Date.now() + GELDIG_DAGEN * 86400000}`;
  return `${VOORBEELD}${s}.${teken(s)}`;
}
export function leesVoorbeeldToken(token: string): string | null {
  const [id, exp, sig] = token.slice(VOORBEELD.length).split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const goed = Buffer.from(teken(`${id}.${exp}`));
  const echt = Buffer.from(sig);
  return goed.length === echt.length && timingSafeEqual(goed, echt) ? id : null;
}

/** Wat een kliniek zou krijgen: de groene leads uit de laatste indiening waarin een tabblad aan deze kliniek gekoppeld is. */
export async function voorbeeldVoorKliniek(clinicId: string) {
  const { data: k } = await db().from("clinics").select("id, naam").eq("id", clinicId).maybeSingle();
  if (!k) return null;
  const { data: subs } = await db()
    .from("submissions")
    .select("snapshot_json, period:periods!inner(label)")
    .in("status", ["te_controleren", "goedgekeurd"])
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(10);
  for (const s of (subs ?? []) as unknown as { snapshot_json: ParseResult; period: { label: string } }[]) {
    const matches = await tabMatches(s.snapshot_json);
    const { perClinic } = buildChecklistItems(s.snapshot_json, Object.fromEntries(matches.filter((m) => m.clinic).map((m) => [m.tab, m.clinic!.id])));
    const items = perClinic.get(clinicId);
    if (items?.length) return { kliniek: k.naam as string, periode: s.period.label, items: items.map((i) => ({ ...i, verschenen: null })) };
  }
  // Geen tabblad aan deze kliniek gekoppeld: geen verzonnen aantallen tonen.
  return { kliniek: k.naam as string, periode: "", items: [] as { id: string; naam: string; campagne: string; verschenen: boolean | null }[] };
}

/** Stuurt precies de mail die de kliniek krijgt naar de admin, met een werkende (niet-opslaande) afvinklijst. */
export async function stuurVoorbeeldmail(clinicId: string) {
  const v = await voorbeeldVoorKliniek(clinicId);
  if (!v) throw new Error("Onbekende kliniek");
  if (!v.items.length) throw new Error(`Geen tabblad in de laatste indieningen gekoppeld aan ${v.kliniek}`);
  const mail = buildClinicMail({ kliniek: v.kliniek, aantal: v.items.length, periode: v.periode, link: `${base()}/kliniek/${voorbeeldToken(clinicId)}` });
  await sendMail({ to: env("ADMIN_EMAIL"), ...mail, subject: `[TEST ${v.kliniek}] ${mail.subject}` });
}

/** Wachtrij (cron): settings.voorbeeldmail_kliniek gezet → voorbeeldmail sturen en leegmaken. */
export async function verwerkVoorbeeldmail() {
  const { data } = await db().from("settings").select("voorbeeldmail_kliniek").eq("id", 1).maybeSingle();
  const id = (data as { voorbeeldmail_kliniek: string | null } | null)?.voorbeeldmail_kliniek;
  if (!id) return null;
  await db().from("settings").update({ voorbeeldmail_kliniek: null }).eq("id", 1);
  await stuurVoorbeeldmail(id);
  return id;
}
