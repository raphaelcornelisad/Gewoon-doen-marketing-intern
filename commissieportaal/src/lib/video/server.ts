import "server-only";
import { check } from "../crm/server";
import { db } from "../supabase/server";
import type { BronRij } from "./track";

/** Eén event opslaan (service_role). */
export async function slaVideoEventOp(row: Record<string, unknown>): Promise<void> {
  check(await db().from("video_events").insert(row));
}

/** Tellingen per bron en pagina, met subtotaal per bron (page null) en totaal (source null). */
export async function videoBronnen(van: string, tot?: string): Promise<BronRij[]> {
  const r = await db().rpc("video_bronnen", tot ? { p_van: van, p_tot: tot } : { p_van: van });
  return (check(r) ?? []) as BronRij[];
}
