import "server-only";
import { randomBytes } from "node:crypto";
import { brand } from "@/config/brand";
import { applyAnswers, countAnswers, type ChecklistItem } from "../attendance";
import { env } from "../env";
import { sendMail } from "../mail/resend";
import { fetchSpreadsheet, SheetFetchError } from "../sheets/fetch";
import { extractSpreadsheetId } from "../sheets/parse-url";
import { parseSpreadsheet } from "../sheets/parser";
import { db } from "../supabase/server";
import { buildReactivation, type ReactItem } from "./build";

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const base = () => env("APP_URL").replace(/\/$/, "");
export const reactUrl = (token: string) => `${base()}/reactivatie/${token}`;

export interface ReactList {
  id: string;
  campaign_id: string;
  token: string;
  items_json: ReactItem[];
  locked: boolean;
  sent_at: string | null;
  sent_to: string | null;
  submitted_at: string | null;
  updated_at: string;
  clinic: { id: string; naam: string; email: string | null; email_override: string | null };
}
const LIST_SELECT = "id, campaign_id, token, items_json, locked, sent_at, sent_to, submitted_at, updated_at, clinic:clinics!inner(id, naam, email, email_override)";

export async function createCampaign(naam: string, urls: string[]) {
  const sheets: { titel: string; parsed: ReturnType<typeof parseSpreadsheet>; url: string }[] = [];
  const fouten: string[] = [];
  for (const url of urls) {
    const id = extractSpreadsheetId(url);
    if (!id) {
      fouten.push(`Geen geldige sheetlink: ${url}`);
      continue;
    }
    try {
      const parsed = parseSpreadsheet(await fetchSpreadsheet(id, env("GOOGLE_API_KEY")));
      sheets.push({ titel: parsed.titel || id, parsed, url });
    } catch (e) {
      fouten.push(`${url}: ${e instanceof SheetFetchError ? e.message : "kon niet worden gelezen"}`);
    }
  }
  if (!sheets.length) return { ok: false as const, message: "Geen enkele sheet kon worden gelezen.", fouten };

  const sb = db();
  const clinics = (check(await sb.from("clinics").select("id, naam")) ?? []) as { id: string; naam: string }[];
  const map = (check(await sb.from("tab_clinic_map").select("tab_naam, clinic_id")) ?? []) as { tab_naam: string; clinic_id: string }[];
  const r = buildReactivation(sheets, clinics, Object.fromEntries(map.map((m) => [m.tab_naam, m.clinic_id])));

  const campaign = check(
    await sb
      .from("reactivation_campaigns")
      .insert({ naam, bronnen: sheets.map((s) => ({ url: s.url, titel: s.titel, groen: s.parsed.totaal.groen })) })
      .select("id")
      .single(),
  ) as { id: string };
  const rows = [...r.perClinic.entries()].map(([clinicId, items]) => ({
    campaign_id: campaign.id,
    clinic_id: clinicId,
    token: randomBytes(24).toString("base64url"),
    items_json: items,
  }));
  if (rows.length) check(await sb.from("reactivation_lists").insert(rows));
  return { ok: true as const, id: campaign.id, lijsten: rows.length, leads: rows.reduce((n, x) => n + x.items_json.length, 0), nietHerkend: r.nietHerkend, dubbel: r.dubbel, fouten };
}

export async function campaigns() {
  return (check(await db().from("reactivation_campaigns").select("id, naam, bronnen, created_at").order("created_at", { ascending: false })) ?? []) as {
    id: string;
    naam: string;
    bronnen: { url: string; titel: string; groen: number }[];
    created_at: string;
  }[];
}

export async function campaignLists(campaignId: string): Promise<ReactList[]> {
  const rows = (check(await db().from("reactivation_lists").select(LIST_SELECT).eq("campaign_id", campaignId)) ?? []) as unknown as ReactList[];
  return rows.sort((a, b) => a.clinic.naam.localeCompare(b.clinic.naam, "nl"));
}

async function testMode() {
  const row = check(await db().from("settings").select("clinic_mail_test_mode").eq("id", 1).maybeSingle()) as { clinic_mail_test_mode: boolean } | null;
  return row?.clinic_mail_test_mode ?? true;
}

export async function sendReactList(listId: string) {
  const l = check(await db().from("reactivation_lists").select(LIST_SELECT).eq("id", listId).single()) as unknown as ReactList;
  const echt = l.clinic.email_override || l.clinic.email;
  const test = await testMode();
  if (!echt && !test) return { ok: false as const, reden: `Geen e-mailadres voor ${l.clinic.naam}` };
  const to = test ? env("ADMIN_EMAIL") : echt!;
  const C = brand.kleuren;
  const link = reactUrl(l.token);
  const n = l.items_json.length;
  const subject = `${test ? `[TEST → ${echt ?? "geen adres"}] ` : ""}Welke klanten zijn op locatie geweest? (${n} namen)`;
  await sendMail({
    to,
    subject,
    text: `Beste team van ${l.clinic.naam},\n\nWe starten een reactivatiecampagne. Wil je voor deze ${n} klanten aangeven of ze bij jullie op locatie zijn geweest? Per naam Ja of Nee, en dan Indienen.\n\n${link}\n\nJe hoeft niet in te loggen en kunt tussendoor opslaan.\n\nMet vriendelijke groet,\n${brand.naam}`,
    html: `<!doctype html><html lang="nl"><body style="margin:0;background:${C.vlak};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.tekst};font-size:16px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.wit};border:1px solid ${C.rand};border-radius:10px;overflow:hidden">
<tr><td style="background:${C.zwart};color:${C.wit};padding:14px 20px;font-weight:700">Gewoon Doen <span style="color:${C.primair}">Marketing</span></td></tr>
<tr><td style="padding:24px 20px">
<p style="margin:0 0 12px">Beste team van ${l.clinic.naam},</p>
<p style="margin:0 0 20px">We starten een <strong>reactivatiecampagne</strong>. Wil je voor deze <strong>${n} klanten</strong> aangeven of ze bij jullie op locatie zijn geweest? Per naam Ja of Nee, en dan Indienen.</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:${C.primair};color:${C.wit};text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Lijst openen</a></p>
<p style="margin:0 0 20px;color:${C.tekstZacht};font-size:14px">Je hoeft niet in te loggen en kunt tussendoor opslaan.</p>
<p style="margin:0">Met vriendelijke groet,<br>${brand.naam}</p>
</td></tr></table></td></tr></table></body></html>`,
  });
  check(await db().from("reactivation_lists").update({ sent_at: new Date().toISOString(), sent_to: to }).eq("id", l.id));
  return { ok: true as const, to };
}

export async function reactListByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return check(await db().from("reactivation_lists").select(LIST_SELECT).eq("token", token).maybeSingle()) as unknown as ReactList | null;
}

export async function saveReactAnswers(token: string, antwoorden: Record<string, unknown>, indienen: boolean) {
  const l = await reactListByToken(token);
  if (!l) return { ok: false, status: 404, message: "Deze lijst bestaat niet." };
  if (l.locked) return { ok: false, status: 409, message: "Deze lijst is afgesloten." };
  const items = applyAnswers(l.items_json as unknown as ChecklistItem[], antwoorden) as unknown as ReactItem[];
  const now = new Date().toISOString();
  const eerste = indienen && !l.submitted_at;
  check(
    await db()
      .from("reactivation_lists")
      .update({ items_json: items, updated_at: now, ...(indienen ? { submitted_at: l.submitted_at ?? now } : {}) })
      .eq("id", l.id)
      .eq("locked", false),
  );
  const t = countAnswers(items as unknown as ChecklistItem[]);
  if (eerste) {
    await sendMail({
      to: env("ADMIN_EMAIL"),
      subject: `Reactivatie: ${l.clinic.naam} heeft de lijst ingediend (${t.ja} ja, ${t.nee} nee)`,
      text: `${l.clinic.naam} heeft de reactivatielijst ingediend.\n\nOp locatie geweest: ${t.ja}\nNiet geweest: ${t.nee}\nNiet ingevuld: ${t.open}`,
      html: `<p><strong>${l.clinic.naam}</strong> heeft de reactivatielijst ingediend.</p><p>Op locatie geweest: <strong>${t.ja}</strong><br>Niet geweest: ${t.nee}<br>Niet ingevuld: ${t.open}</p>`,
    }).catch((e) => console.error("Melding reactivatie niet verstuurd", e));
  }
  return { ok: true, status: 200, message: indienen ? "Ingediend. Bedankt!" : "Opgeslagen." };
}
