import "server-only";
import { db } from "../supabase/server";
import { UITKOMSTEN } from "./core";
import { all, amsterdamMidnight, check, CrmError, type CrmUser } from "./server";
import { huidigeCrmId } from "./werkruimte";

export interface Sessie {
  id: string;
  setter_id: string;
  status: "actief" | "ingediend";
  gestart_op: string;
  beeindigd_op: string | null;
  pauze_sec: number;
  pauze_sinds: string | null;
  gebeld: number | null;
  gesproken: number | null;
  wafu: number | null;
  ingepland: number | null;
  notitie: string | null;
}

export interface Tellers {
  gebeld: number;
  gesproken: number;
  wafu: number;
  ingepland: number;
}

const COLS = "id, setter_id, status, gestart_op, beeindigd_op, pauze_sec, pauze_sinds, gebeld, gesproken, wafu, ingepland, notitie";
const BEREIKT = new Set<string>(UITKOMSTEN.filter((u) => u.bereikt).map((u) => u.key));

function alleenSetter(user: CrmUser) {
  if (user.rol !== "setter") throw new CrmError("Belsessies zijn voor setters.", 403);
  return user.setter;
}

/** Actieve tijd in seconden: totale duur min pauzes (een lopende pauze telt niet mee). */
export function actieveSec(s: Pick<Sessie, "gestart_op" | "beeindigd_op" | "pauze_sec" | "pauze_sinds">, nu = Date.now()) {
  const eind = s.beeindigd_op ? Date.parse(s.beeindigd_op) : nu;
  const lopendePauze = s.pauze_sinds ? Math.max(0, eind - Date.parse(s.pauze_sinds)) / 1000 : 0;
  return Math.max(0, Math.round((eind - Date.parse(s.gestart_op)) / 1000 - s.pauze_sec - lopendePauze));
}

/**
 * Tellers voor een setter in een tijdvak. Gebeld = belpogingen met vastgelegde uitkomst; gesproken = lead bereikt;
 * WAFU = leads die een WhatsApp-bericht kregen of de uitkomst "Opvolgen via WhatsApp" (per lead één keer).
 */
export async function tellers(setterId: string, van: string, tot: string): Promise<Tellers> {
  const [calls, berichten] = await Promise.all([
    all<{ contact_id: string; uitkomst: string | null }>((f, t) => db().from("crm_calls").select("contact_id, uitkomst").eq("setter_id", setterId).gte("gestart_op", van).lt("gestart_op", tot).order("id").range(f, t)),
    all<{ contact_id: string }>((f, t) => db().from("crm_messages").select("contact_id").eq("setter_id", setterId).eq("kanaal", "whatsapp").eq("richting", "uit").gte("created_at", van).lt("created_at", tot).order("id").range(f, t)),
  ]);
  const met = calls.filter((c) => c.uitkomst);
  const wafu = new Set([...berichten.map((b) => b.contact_id), ...met.filter((c) => c.uitkomst === "wafu").map((c) => c.contact_id)]);
  return {
    gebeld: met.length,
    gesproken: met.filter((c) => BEREIKT.has(c.uitkomst!)).length,
    wafu: wafu.size,
    ingepland: met.filter((c) => c.uitkomst === "ingepland").length,
  };
}

export async function huidigeSessie(user: CrmUser): Promise<(Sessie & { tellers: Tellers; actief_sec: number }) | null> {
  const s = alleenSetter(user);
  const r = check(await db().from("crm_belsessies").select(COLS).eq("setter_id", s.id).eq("status", "actief").maybeSingle()) as Sessie | null;
  if (!r) return null;
  return { ...r, tellers: await tellers(s.id, r.gestart_op, new Date().toISOString()), actief_sec: actieveSec(r) };
}

export async function startSessie(user: CrmUser) {
  const s = alleenSetter(user);
  const bestaand = await huidigeSessie(user);
  if (bestaand) return bestaand;
  const { error } = await db().from("crm_belsessies").insert({ setter_id: s.id, crm_id: await huidigeCrmId() });
  if (error && !/duplicate/.test(error.message)) throw new Error(error.message);
  return huidigeSessie(user);
}

export async function pauzeer(user: CrmUser, aan: boolean) {
  const r = await huidigeSessie(user);
  if (!r) throw new CrmError("Er loopt geen belsessie.");
  const nu = new Date();
  if (aan && !r.pauze_sinds) check(await db().from("crm_belsessies").update({ pauze_sinds: nu.toISOString() }).eq("id", r.id));
  if (!aan && r.pauze_sinds) {
    const extra = Math.round((nu.getTime() - Date.parse(r.pauze_sinds)) / 1000);
    check(await db().from("crm_belsessies").update({ pauze_sinds: null, pauze_sec: r.pauze_sec + extra }).eq("id", r.id));
  }
  return huidigeSessie(user);
}

/** Afsluiten en indienen: tellers worden vastgelegd zodat het overzicht niet meer verschuift. */
export async function dienIn(user: CrmUser, notitie: string) {
  const s = alleenSetter(user);
  const r = await huidigeSessie(user);
  if (!r) throw new CrmError("Er loopt geen belsessie.");
  const nu = new Date();
  const pauze = r.pauze_sinds ? r.pauze_sec + Math.round((nu.getTime() - Date.parse(r.pauze_sinds)) / 1000) : r.pauze_sec;
  const t = await tellers(s.id, r.gestart_op, nu.toISOString());
  check(
    await db()
      .from("crm_belsessies")
      .update({ status: "ingediend", beeindigd_op: nu.toISOString(), pauze_sec: pauze, pauze_sinds: null, ...t, notitie: notitie.trim().slice(0, 2000) || null })
      .eq("id", r.id)
      .eq("status", "actief"),
  );
  return { ...t, actief_sec: actieveSec({ gestart_op: r.gestart_op, beeindigd_op: nu.toISOString(), pauze_sec: pauze, pauze_sinds: null }) };
}

/** Alle sessies in [van, tot) op datum (Europe/Amsterdam), voor het beheeroverzicht. */
export async function sessiesTussen(van: string, tot: string): Promise<(Sessie & { tellers: Tellers; actief_sec: number })[]> {
  const rijen = await all<Sessie>((f, t) => db().from("crm_belsessies").select(COLS).gte("gestart_op", amsterdamMidnight(van)).lt("gestart_op", amsterdamMidnight(tot)).order("gestart_op").order("id").range(f, t));
  return Promise.all(
    rijen.map(async (r) => ({
      ...r,
      // Lopende sessies: live tellen; ingediende: vastgelegde cijfers.
      tellers: r.status === "actief" ? await tellers(r.setter_id, r.gestart_op, new Date().toISOString()) : { gebeld: r.gebeld ?? 0, gesproken: r.gesproken ?? 0, wafu: r.wafu ?? 0, ingepland: r.ingepland ?? 0 },
      actief_sec: actieveSec(r),
    })),
  );
}
