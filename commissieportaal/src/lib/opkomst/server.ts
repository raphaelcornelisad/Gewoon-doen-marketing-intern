import "server-only";
import { randomBytes } from "node:crypto";
import {
  applyAnswers,
  buildChecklistItems,
  countAnswers,
  opkomstVoorPeriode,
  type AttendanceRow,
  type ChecklistItem,
} from "../attendance";
import { calculateCommission, type Commission } from "../commission";
import { env } from "../env";
import { buildClinicMail } from "../mail/clinic";
import { sendMail } from "../mail/resend";
import type { AppSettings } from "../settings";
import type { Counts, ParseResult } from "../sheets/types";
import { db } from "../supabase/server";

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const base = () => env("APP_URL").replace(/\/$/, "");
export const checklistUrl = (token: string) => `${base()}/kliniek/${token}`;

export interface ChecklistRow {
  id: string;
  token: string;
  items_json: ChecklistItem[];
  locked: boolean;
  sent_at: string | null;
  sent_to: string | null;
  submitted_at: string | null;
  updated_at: string;
  clinic: { id: string; naam: string; email: string | null; email_override: string | null };
}

const CHECKLIST_SELECT =
  "id, token, items_json, locked, sent_at, sent_to, submitted_at, updated_at, clinic:clinics!inner(id, naam, email, email_override)";

export async function checklistsFor(setterId: string, periodId: string): Promise<ChecklistRow[]> {
  const rows = check(await db().from("checklists").select(CHECKLIST_SELECT).eq("setter_id", setterId).eq("period_id", periodId));
  return ((rows ?? []) as unknown as ChecklistRow[]).sort((a, b) => a.clinic.naam.localeCompare(b.clinic.naam, "nl"));
}

export async function previousPeriod(start: string): Promise<{ id: string; label: string } | null> {
  return check(await db().from("periods").select("id, label").eq("eind", start).maybeSingle());
}

export async function attendanceFor(setterId: string, periodId: string): Promise<AttendanceRow | null> {
  return check(
    await db()
      .from("attendance")
      .select("id, status, max_count, approved_count, paid_in_period_id")
      .eq("setter_id", setterId)
      .eq("period_id", periodId)
      .maybeSingle(),
  ) as AttendanceRow | null;
}

/** Alles over de opkomstbonus die bij een indiening hoort (vorige periode van dezelfde setter). */
export async function opkomstInfo(setterId: string, periodStart: string, currentPeriodId: string) {
  const prev = await previousPeriod(periodStart);
  if (!prev) return { prev: null, attendance: null, checklists: [] as ChecklistRow[], ...opkomstVoorPeriode(null, [], currentPeriodId) };
  const [attendance, checklists] = await Promise.all([attendanceFor(setterId, prev.id), checklistsFor(setterId, prev.id)]);
  const r = opkomstVoorPeriode(attendance, checklists.map((c) => c.items_json), currentPeriodId);
  return { prev, attendance, checklists, ...r };
}

export function recalc(counts: Pick<Counts, "groen" | "geel" | "rood" | "ongekleurd">, settings: AppSettings, opkomst: number): Commission {
  return calculateCommission(counts, settings.commissie, opkomst);
}

async function clinicMailTestMode(): Promise<boolean> {
  const row = check(await db().from("settings").select("clinic_mail_test_mode").eq("id", 1).maybeSingle()) as {
    clinic_mail_test_mode: boolean;
  } | null;
  return row?.clinic_mail_test_mode ?? true;
}

/** Verstuurt (of herverstuurt) de afvinklijst. In testmodus gaat de mail naar de admin. */
export async function sendChecklist(checklistId: string, periodeLabel: string) {
  const c = check(await db().from("checklists").select(CHECKLIST_SELECT).eq("id", checklistId).single()) as unknown as ChecklistRow;
  const echtAdres = c.clinic.email_override || c.clinic.email;
  const test = await clinicMailTestMode();
  if (!echtAdres && !test) return { ok: false as const, reden: `Geen e-mailadres voor ${c.clinic.naam}` };
  const to = test ? env("ADMIN_EMAIL") : echtAdres!;
  const mail = buildClinicMail({
    kliniek: c.clinic.naam,
    aantal: c.items_json.length,
    periode: periodeLabel,
    link: checklistUrl(c.token),
  });
  await sendMail({
    to,
    ...mail,
    subject: test ? `[TEST → ${echtAdres ?? "geen adres"}] ${mail.subject}` : mail.subject,
  });
  check(await db().from("checklists").update({ sent_at: new Date().toISOString(), sent_to: to }).eq("id", c.id));
  return { ok: true as const, to, test };
}

export interface ApproveResult {
  ok: boolean;
  message: string;
  verstuurd?: { kliniek: string; to?: string; fout?: string }[];
  nietGekoppeld?: { tab: string; groen: number }[];
}

/**
 * Goedkeuren. Volgorde is zo gekozen dat opnieuw proberen veilig is:
 * 1. opkomst vorige periode vastzetten als "uitbetaald in deze periode" + lijsten op slot
 * 2. eindbedrag berekenen en indiening op goedgekeurd zetten (gaat op slot)
 * 3. opkomst-rij voor deze periode + afvinklijsten per kliniek aanmaken en versturen
 */
export async function approveSubmission(id: string): Promise<ApproveResult> {
  const sb = db();
  const s = check(
    await sb
      .from("submissions")
      .select("id, status, setter_id, period_id, snapshot_json, counts_json, settings_json, period:periods!inner(id, start, label)")
      .eq("id", id)
      .single(),
  ) as unknown as {
    id: string;
    status: string;
    setter_id: string;
    period_id: string;
    snapshot_json: ParseResult;
    counts_json: { totaal: Counts };
    settings_json: AppSettings;
    period: { id: string; start: string; label: string };
  };
  if (s.status === "vervangen") return { ok: false, message: "Deze indiening is vervangen door een nieuwere." };

  if (s.status !== "goedgekeurd") {
    const info = await opkomstInfo(s.setter_id, s.period.start, s.period_id);
    if (info.attendance && info.bron !== "al_uitbetaald" && info.prev) {
      check(
        await sb
          .from("attendance")
          .update({
            approved_count: info.aantal,
            clinic_checked_count: info.checklists.reduce((n, c) => n + countAnswers(c.items_json).ja, 0),
            status: "uitbetaald",
            paid_in_period_id: s.period_id,
          })
          .eq("id", info.attendance.id),
      );
      check(await sb.from("checklists").update({ locked: true }).eq("setter_id", s.setter_id).eq("period_id", info.prev.id));
    }
    const commission = recalc(s.counts_json.totaal, s.settings_json, info.bron === "al_uitbetaald" ? 0 : info.aantal);
    check(
      await sb
        .from("submissions")
        .update({ status: "goedgekeurd", approved_at: new Date().toISOString(), commission_json: commission })
        .eq("id", s.id)
        .eq("status", "te_controleren"),
    );
  }

  // Opkomst-rij voor deze periode (max = aantal groen).
  check(
    await sb
      .from("attendance")
      .upsert(
        { setter_id: s.setter_id, period_id: s.period_id, max_count: s.counts_json.totaal.groen },
        { onConflict: "setter_id,period_id", ignoreDuplicates: true },
      ),
  );

  // Afvinklijsten per kliniek.
  const map = check(await sb.from("tab_clinic_map").select("tab_naam, clinic_id")) as { tab_naam: string; clinic_id: string }[];
  const { perClinic, unmapped } = buildChecklistItems(
    s.snapshot_json,
    Object.fromEntries(map.map((m) => [m.tab_naam, m.clinic_id])),
  );
  for (const [clinicId, items] of perClinic) {
    check(
      await sb.from("checklists").upsert(
        {
          clinic_id: clinicId,
          setter_id: s.setter_id,
          period_id: s.period_id,
          submission_id: s.id,
          token: randomBytes(24).toString("base64url"),
          items_json: items,
        },
        { onConflict: "clinic_id,setter_id,period_id", ignoreDuplicates: true },
      ),
    );
  }

  const lists = await checklistsFor(s.setter_id, s.period_id);
  const verstuurd: ApproveResult["verstuurd"] = [];
  for (const c of lists) {
    if (c.sent_at) continue;
    try {
      const r = await sendChecklist(c.id, s.period.label);
      verstuurd.push(r.ok ? { kliniek: c.clinic.naam, to: r.to } : { kliniek: c.clinic.naam, fout: r.reden });
    } catch (e) {
      console.error("Afvinklijst niet verstuurd", c.id, e);
      verstuurd.push({ kliniek: c.clinic.naam, fout: "Versturen mislukt" });
    }
  }
  return { ok: true, message: "Goedgekeurd.", verstuurd, nietGekoppeld: unmapped };
}

/** Admin stelt het aantal verschenen vast (of maakt het leeg om de klinieken te volgen). */
export async function setApprovedCount(attendanceId: string, aantal: number | null) {
  const a = check(await db().from("attendance").select("status, max_count").eq("id", attendanceId).single()) as {
    status: string;
    max_count: number;
  };
  if (a.status === "uitbetaald") return { ok: false, message: "Deze opkomstbonus is al uitbetaald en staat op slot." };
  if (aantal !== null && (!Number.isInteger(aantal) || aantal < 0 || aantal > a.max_count)) {
    return { ok: false, message: `Vul een heel getal in tussen 0 en ${a.max_count}.` };
  }
  check(
    await db()
      .from("attendance")
      .update({ approved_count: aantal, status: aantal === null ? "open" : "bevestigd" })
      .eq("id", attendanceId),
  );
  return { ok: true, message: "Opgeslagen." };
}

// ---------- Kliniekkant ----------

export async function checklistByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const row = check(
    await db()
      .from("checklists")
      .select(`${CHECKLIST_SELECT}, setter_id, period_id, period:periods!inner(label)`)
      .eq("token", token)
      .maybeSingle(),
  );
  return row as unknown as (ChecklistRow & { setter_id: string; period_id: string; period: { label: string } }) | null;
}

export async function saveClinicAnswers(token: string, antwoorden: Record<string, unknown>, indienen: boolean) {
  const c = await checklistByToken(token);
  if (!c) return { ok: false, status: 404, message: "Deze afvinklijst bestaat niet." };
  if (c.locked) return { ok: false, status: 409, message: "Deze afvinklijst is afgesloten en kan niet meer worden aangepast." };

  const items = applyAnswers(c.items_json, antwoorden);
  const telling = countAnswers(items);
  const now = new Date().toISOString();
  const eersteKeerIngediend = indienen && !c.submitted_at;
  check(
    await db()
      .from("checklists")
      .update({ items_json: items, updated_at: now, ...(indienen ? { submitted_at: c.submitted_at ?? now } : {}) })
      .eq("id", c.id)
      .eq("locked", false),
  );

  // Totaal "Ja" over alle klinieken van deze setter en periode bijwerken.
  const alle = await checklistsFor(c.setter_id, c.period_id);
  const ja = alle.reduce((n, l) => n + countAnswers(l.id === c.id ? items : l.items_json).ja, 0);
  check(await db().from("attendance").update({ clinic_checked_count: ja }).eq("setter_id", c.setter_id).eq("period_id", c.period_id));

  if (eersteKeerIngediend) {
    try {
      await sendMail({
        to: env("ADMIN_EMAIL"),
        subject: `${c.clinic.naam} heeft de opkomst ingediend: ${telling.ja} van ${telling.totaal} verschenen`,
        text: `${c.clinic.naam} heeft de afvinklijst voor ${c.period.label} ingediend.\n\nVerschenen: ${telling.ja}\nNiet verschenen: ${telling.nee}\nNiet ingevuld: ${telling.open}\n\nDit telt mee als opkomstbonus bij de volgende goedkeuring van deze setter.`,
        html: `<p><strong>${c.clinic.naam}</strong> heeft de afvinklijst voor ${c.period.label} ingediend.</p><p>Verschenen: <strong>${telling.ja}</strong><br>Niet verschenen: ${telling.nee}<br>Niet ingevuld: ${telling.open}</p><p>Dit telt mee als opkomstbonus bij de volgende goedkeuring van deze setter.</p>`,
      });
    } catch (e) {
      console.error("Melding ingediende afvinklijst niet verstuurd", e);
    }
  }
  return { ok: true, status: 200, message: indienen ? "Ingediend. Bedankt!" : "Opgeslagen.", telling, ingediend: indienen || !!c.submitted_at };
}
