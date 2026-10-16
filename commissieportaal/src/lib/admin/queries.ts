import "server-only";
import type { Commission } from "../commission";
import type { CountsJson } from "../submissions/submit";
import type { ParseResult } from "../sheets/types";
import { db } from "../supabase/server";

export interface SubmissionRow {
  id: string;
  status: "te_controleren" | "goedgekeurd" | "vervangen";
  submitted_at: string;
  approved_at: string | null;
  sheet_url: string;
  sheet_title: string;
  commission_json: Commission;
  counts_json: CountsJson;
  setter: { id: string; naam: string; email: string; is_nieuw: boolean };
  period: { id: string; start: string; eind: string; label: string };
}

export interface SubmissionDetail extends SubmissionRow {
  snapshot_json: ParseResult;
  corrections_json: unknown[];
}

const LIST = `id, status, submitted_at, approved_at, sheet_url, sheet_title, commission_json, counts_json,
  setter:setters!inner(id, naam, email, is_nieuw), period:periods!inner(id, start, eind, label)`;

export async function listSubmissions(): Promise<SubmissionRow[]> {
  const { data, error } = await db()
    .from("submissions")
    .select(LIST)
    .neq("status", "vervangen")
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = data as unknown as SubmissionRow[];
  return rows.sort(
    (a, b) => b.period.start.localeCompare(a.period.start) || a.setter.naam.localeCompare(b.setter.naam, "nl"),
  );
}

export async function getSubmission(id: string): Promise<SubmissionDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db()
    .from("submissions")
    .select(`${LIST}, snapshot_json, corrections_json, settings_json`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as SubmissionDetail | null;
}

/** Eerdere (vervangen) indieningen van dezelfde setter en periode. */
export async function replacedVersions(setterId: string, periodId: string) {
  const { data, error } = await db()
    .from("submissions")
    .select("id, submitted_at, commission_json")
    .eq("setter_id", setterId)
    .eq("period_id", periodId)
    .eq("status", "vervangen")
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; submitted_at: string; commission_json: Commission }[];
}
