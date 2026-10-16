import type { ParseResult } from "./sheets/types";

export interface ChecklistItem {
  /** `${tab}:${rij}` — stabiel binnen één snapshot */
  id: string;
  naam: string;
  campagne: string;
  verschenen: boolean | null;
}

export interface AttendanceRow {
  id: string;
  status: "open" | "bevestigd" | "uitbetaald";
  max_count: number;
  approved_count: number | null;
  paid_in_period_id: string | null;
}

/** Groene leads per kliniek, gegroepeerd via de tab → kliniek-koppeling. */
export function buildChecklistItems(snapshot: ParseResult, tabToClinic: Record<string, string | undefined>) {
  const perClinic = new Map<string, ChecklistItem[]>();
  const unmapped: { tab: string; groen: number }[] = [];
  for (const tab of snapshot.tabs) {
    if (tab.overgeslagen) continue;
    const groen = tab.rijen.filter((r) => r.kleur === "groen");
    if (!groen.length) continue;
    const clinicId = tabToClinic[tab.tab];
    if (!clinicId) {
      unmapped.push({ tab: tab.tab, groen: groen.length });
      continue;
    }
    const list = perClinic.get(clinicId) ?? [];
    for (const r of groen) list.push({ id: `${tab.tab}:${r.rij}`, naam: r.naam, campagne: tab.tab, verschenen: null });
    perClinic.set(clinicId, list);
  }
  return { perClinic, unmapped };
}

export function countAnswers(items: ChecklistItem[]) {
  let ja = 0;
  let nee = 0;
  for (const i of items) {
    if (i.verschenen === true) ja++;
    else if (i.verschenen === false) nee++;
  }
  return { ja, nee, open: items.length - ja - nee, totaal: items.length };
}

/** Werkt antwoorden bij; onbekende ids en ongeldige waarden worden genegeerd. */
export function applyAnswers(items: ChecklistItem[], antwoorden: Record<string, unknown>): ChecklistItem[] {
  return items.map((i) => {
    if (!(i.id in antwoorden)) return i;
    const v = antwoorden[i.id];
    return v === true || v === false || v === null ? { ...i, verschenen: v } : i;
  });
}

/**
 * Opkomstbonus (aantal verschenen leads) van de vorige periode die in deze periode meetelt.
 * - al uitbetaald in een andere periode → 0 (nooit dubbel)
 * - door admin vastgesteld aantal → dat aantal
 * - anders → aantal "Ja" van de klinieken
 */
export function opkomstVoorPeriode(
  prev: AttendanceRow | null,
  prevChecklists: ChecklistItem[][],
  currentPeriodId: string,
): { aantal: number; bron: "geen" | "al_uitbetaald" | "admin" | "klinieken" } {
  if (!prev) return { aantal: 0, bron: "geen" };
  if (prev.paid_in_period_id && prev.paid_in_period_id !== currentPeriodId) return { aantal: 0, bron: "al_uitbetaald" };
  if (prev.approved_count !== null) return { aantal: Math.min(prev.approved_count, prev.max_count), bron: "admin" };
  const ja = prevChecklists.reduce((s, items) => s + countAnswers(items).ja, 0);
  return { aantal: Math.min(ja, prev.max_count), bron: "klinieken" };
}
