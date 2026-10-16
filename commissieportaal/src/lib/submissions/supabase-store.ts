import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { settingsFromRow, type SettingsRow } from "../settings";
import { opkomstVoorPeriode, type AttendanceRow, type ChecklistItem } from "../attendance";
import type { SubmissionStore } from "./submit";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

function checkRow<T>(res: { data: T | null; error: { message: string } | null }): T {
  const row = check(res);
  if (!row) throw new Error("Geen rij teruggekregen");
  return row;
}

export function supabaseSubmissionStore(sb: SupabaseClient): SubmissionStore {
  return {
    async getSettings() {
      const row = check(await sb.from("settings").select("*").eq("id", 1).maybeSingle());
      return settingsFromRow(row as SettingsRow | null);
    },

    async findSetterByEmail(email) {
      return check(await sb.from("setters").select("id").eq("email", email).maybeSingle());
    },

    async createSetter(naam, email) {
      // upsert op e-mail vangt een gelijktijdige eerste indiening op
      return checkRow(
        await sb
          .from("setters")
          .upsert({ naam, email, is_nieuw: true }, { onConflict: "email", ignoreDuplicates: false })
          .select("id")
          .single(),
      );
    },

    async ensurePeriod(p) {
      const found = check(
        await sb.from("periods").select("id").eq("start", p.start).eq("eind", p.eind).maybeSingle(),
      );
      if (found) return found;
      return checkRow(
        await sb
          .from("periods")
          .upsert({ start: p.start, eind: p.eind, label: p.label }, { onConflict: "start,eind" })
          .select("id")
          .single(),
      );
    },

    async activeSubmissionStatus(setterId, periodId) {
      const row = check(
        await sb
          .from("submissions")
          .select("status")
          .eq("setter_id", setterId)
          .eq("period_id", periodId)
          .neq("status", "vervangen")
          .maybeSingle(),
      );
      return row?.status ?? null;
    },

    async confirmedAttendance(setterId, start) {
      // Opkomst van de vorige periode: door admin vastgesteld, anders het aantal "Ja" van de klinieken.
      const prev = check(await sb.from("periods").select("id").eq("eind", start).maybeSingle());
      if (!prev) return 0;
      const att = check(
        await sb
          .from("attendance")
          .select("id, status, max_count, approved_count, paid_in_period_id")
          .eq("setter_id", setterId)
          .eq("period_id", prev.id)
          .maybeSingle(),
      ) as AttendanceRow | null;
      const lists = check(
        await sb.from("checklists").select("items_json").eq("setter_id", setterId).eq("period_id", prev.id),
      ) as { items_json: ChecklistItem[] }[];
      return opkomstVoorPeriode(att, (lists ?? []).map((l) => l.items_json), "").aantal;
    },

    async save(s) {
      const data = check(
        await sb.rpc("submit_snapshot", {
          p_setter_id: s.setterId,
          p_period_id: s.periodId,
          p_sheet_url: s.sheetUrl,
          p_sheet_id: s.sheetId,
          p_sheet_title: s.sheetTitle,
          p_snapshot: s.snapshot,
          p_counts: s.counts,
          p_commission: s.commission,
          p_settings: s.settings,
        }),
      ) as { result: "nieuw" | "vervangen" | "geblokkeerd"; id: string };
      return data;
    },
  };
}
