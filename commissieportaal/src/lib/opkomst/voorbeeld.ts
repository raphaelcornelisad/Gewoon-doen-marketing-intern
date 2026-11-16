import "server-only";
import { buildChecklistItems } from "../attendance";
import { env } from "../env";
import { buildClinicMail } from "../mail/clinic";
import { sendMail } from "../mail/resend";
import type { ParseResult } from "../sheets/types";
import { db } from "../supabase/server";
import { tabMatches } from "./server";

export const VOORBEELD = "voorbeeld-";
const base = () => env("APP_URL").replace(/\/$/, "");

/**
 * Voorbeeld van wat een kliniek krijgt: aantallen en campagnes uit de laatste indiening,
 * met verzonnen klantnamen (de link is openbaar, dus geen echte namen).
 */
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
    if (items?.length) {
      return { kliniek: k.naam as string, periode: s.period.label, items: items.map((i, n) => ({ ...i, id: `v${n}`, naam: `Klant ${n + 1} (voorbeeld)`, verschenen: null })) };
    }
  }
  return { kliniek: k.naam as string, periode: "voorbeeldperiode", items: [1, 2, 3].map((n) => ({ id: `v${n}`, naam: `Klant ${n} (voorbeeld)`, campagne: "Voorbeeldcampagne", verschenen: null })) };
}

/** Stuurt de kliniekmail als voorbeeld naar de admin, met een link naar de voorbeeld-afvinklijst. */
export async function stuurVoorbeeldmail(clinicId: string) {
  const v = await voorbeeldVoorKliniek(clinicId);
  if (!v) throw new Error("Onbekende kliniek");
  const mail = buildClinicMail({ kliniek: v.kliniek, aantal: v.items.length, periode: v.periode, link: `${base()}/kliniek/${VOORBEELD}${clinicId}` });
  await sendMail({ to: env("ADMIN_EMAIL"), ...mail, subject: `[VOORBEELD ${v.kliniek}] ${mail.subject}` });
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
