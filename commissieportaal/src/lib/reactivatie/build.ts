import { matchClinic, normalizeName, type ClinicRef } from "../clinic-match";
import type { ParseResult } from "../sheets/types";

export interface ReactItem {
  id: string;
  naam: string;
  campagne: string;
  bron: string;
  verschenen: boolean | null;
}

/**
 * Groene leads uit meerdere sheets → één lijst per salon.
 * Dezelfde naam bij dezelfde salon (hoofdletters/spaties/accenten genegeerd) komt één keer voor.
 */
export function buildReactivation(
  sheets: { titel: string; parsed: ParseResult }[],
  clinics: ClinicRef[],
  koppeling: Record<string, string>,
) {
  const perClinic = new Map<string, ReactItem[]>();
  const seen = new Map<string, Set<string>>();
  const nietHerkend: { bron: string; tab: string; groen: number }[] = [];
  let dubbel = 0;

  for (const s of sheets) {
    for (const tab of s.parsed.tabs) {
      if (tab.overgeslagen) continue;
      const groen = tab.rijen.filter((r) => r.kleur === "groen");
      if (!groen.length) continue;
      const m = matchClinic(tab.tab, clinics, koppeling);
      if (!m.clinic) {
        nietHerkend.push({ bron: s.titel, tab: tab.tab, groen: groen.length });
        continue;
      }
      const list = perClinic.get(m.clinic.id) ?? [];
      const names = seen.get(m.clinic.id) ?? new Set<string>();
      for (const r of groen) {
        const key = normalizeName(r.naam);
        if (!key || names.has(key)) {
          dubbel++;
          continue;
        }
        names.add(key);
        list.push({ id: `${s.titel}:${tab.tab}:${r.rij}`, naam: r.naam, campagne: tab.tab, bron: s.titel, verschenen: null });
      }
      perClinic.set(m.clinic.id, list);
      seen.set(m.clinic.id, names);
    }
  }
  return { perClinic, nietHerkend, dubbel };
}

export function toCsv(rows: { salon: string; naam: string; campagne: string; bron: string; verschenen: boolean | null }[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["Salon;Naam;Campagne;Bron;Op locatie geweest"];
  for (const r of rows) {
    lines.push([r.salon, r.naam, r.campagne, r.bron, r.verschenen === true ? "Ja" : r.verschenen === false ? "Nee" : ""].map(esc).join(";"));
  }
  return "﻿" + lines.join("\n");
}
