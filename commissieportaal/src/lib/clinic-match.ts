/**
 * Herkent de salon uit de tabnaam.
 * Afspraak: tab = volledige salonnaam (zoals in Notion), eventueel "Salonnaam - behandeling".
 */

export interface ClinicRef {
  id: string;
  naam: string;
}

export interface TabMatch {
  tab: string;
  salon: string;
  behandeling: string | null;
  clinic: ClinicRef | null;
  via: "naam" | "koppeling" | null;
}

/** Lowercase, zonder accenten, "&"/"and" → "en", alleen letters/cijfers en enkele spaties. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/\band\b/g, " en ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** "Babeau Huidinstituut - Laser" → { salon: "Babeau Huidinstituut", behandeling: "Laser" } */
export function splitTabName(tab: string): { salon: string; behandeling: string | null } {
  const m = tab.match(/^(.*?\S)\s+[-–—]\s+(.+)$/);
  if (!m) return { salon: tab.trim(), behandeling: null };
  return { salon: m[1].trim(), behandeling: m[2].trim() };
}

export function matchClinic(tab: string, clinics: ClinicRef[], koppeling: Record<string, string> = {}): TabMatch {
  const { salon, behandeling } = splitTabName(tab);
  const byNorm = new Map(clinics.map((c) => [normalizeName(c.naam), c]));
  const viaNaam = byNorm.get(normalizeName(salon)) ?? byNorm.get(normalizeName(tab));
  if (viaNaam) return { tab, salon, behandeling, clinic: viaNaam, via: "naam" };
  const id = koppeling[tab];
  const viaKoppeling = id ? clinics.find((c) => c.id === id) : undefined;
  if (viaKoppeling) return { tab, salon, behandeling, clinic: viaKoppeling, via: "koppeling" };
  return { tab, salon, behandeling, clinic: null, via: null };
}
