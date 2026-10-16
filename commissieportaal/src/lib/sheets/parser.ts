import { apiColorToRgb, classifyRgb, rgbToHex } from "./colors";
import {
  DEFAULT_PARSER_OPTIONS,
  type ApiCell,
  type ApiSheet,
  type ApiSpreadsheet,
  type ColumnKey,
  type Counts,
  type LeadRow,
  type ParseResult,
  type ParserOptions,
  type TabResult,
  type Warning,
} from "./types";

const HEADERS: Record<ColumnKey, string> = {
  naam: "Naam Lead",
  opgebeld: "Opgebeld",
  ingepland: "Ingepland",
  wafu: "WAFU",
  nietIngepland: "Niet ingepland",
};

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const NUMERIC = /^[\d\s.,]+$/;

export function emptyCounts(): Counts {
  return { groen: 0, geel: 0, rood: 0, ongekleurd: 0, pogingen: 0 };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return {
    groen: a.groen + b.groen,
    geel: a.geel + b.geel,
    rood: a.rood + b.rood,
    ongekleurd: a.ongekleurd + b.ongekleurd,
    pogingen: a.pogingen + b.pogingen,
  };
}

/** Een leadrij heeft een naam die niet leeg en niet puur numeriek is. */
export function isLeadName(value: string): boolean {
  const v = value.trim();
  return v !== "" && !NUMERIC.test(v);
}

/** Telt de letters in tokens die geheel uit de gegeven letter bestaan, bv. "xx 15-10" → 2. */
export function countLetterTokens(value: string, letter: "x" | "t"): number {
  const re = new RegExp(`\\b${letter}+\\b`, "gi");
  let n = 0;
  for (const m of value.matchAll(re)) n += m[0].length;
  return n;
}

export function contactAttempts(
  wafu: string,
  nietIngepland: string,
  opties: ParserOptions,
): number {
  let n = countLetterTokens(wafu, "x");
  if (opties.wafuTTelt) n += countLetterTokens(wafu, "t");
  if (opties.nietIngeplandXTelt) n += countLetterTokens(nietIngepland, "x");
  return n;
}

const cellText = (c: ApiCell | undefined) => c?.formattedValue ?? "";

function findColumns(header: string[]): Record<ColumnKey, number | null> {
  const norm = header.map(normalize);
  const result = {} as Record<ColumnKey, number | null>;
  for (const [key, name] of Object.entries(HEADERS) as [ColumnKey, string][]) {
    const i = norm.indexOf(normalize(name));
    result[key] = i === -1 ? null : i;
  }
  return result;
}

export function parseTab(
  sheet: ApiSheet,
  opties: ParserOptions,
): { tab: TabResult; waarschuwingen: Warning[] } {
  const tabName = sheet.properties?.title ?? "";
  const rows = (sheet.data ?? []).flatMap((d) => d.rowData ?? []);
  const headerCells = rows[0]?.values ?? [];
  const header = headerCells.map(cellText);
  const kolommen = findColumns(header);
  const waarschuwingen: Warning[] = [];
  const tab: TabResult = {
    tab: tabName,
    overgeslagen: false,
    header,
    kolommen,
    rijen: [],
    counts: emptyCounts(),
    eigenTelling: null,
  };

  const naamCol = kolommen.naam;
  if (naamCol === null) {
    const heeftData = rows.some((r) => (r.values ?? []).some((c) => cellText(c).trim() !== ""));
    tab.overgeslagen = true;
    tab.reden = heeftData ? `Kolom "${HEADERS.naam}" niet gevonden` : "Leeg tabblad";
    if (heeftData) {
      waarschuwingen.push({
        type: "kolom_ontbreekt",
        tab: tabName,
        bericht: `Tabblad "${tabName}" overgeslagen: kolom "${HEADERS.naam}" niet gevonden.`,
      });
    }
    return { tab, waarschuwingen };
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].values ?? [];
    const naamCell = cells[naamCol];
    const naam = cellText(naamCell);
    if (!isLeadName(naam)) {
      const n = Number(naam.trim().replace(",", "."));
      if (naam.trim() !== "" && Number.isFinite(n)) tab.eigenTelling = n;
      continue;
    }

    const bg = naamCell?.effectiveFormat?.backgroundColor;
    const rgb = bg ? apiColorToRgb(bg) : null;
    const kleur = classifyRgb(rgb);
    const get = (col: number | null) => (col === null ? "" : cellText(cells[col]));
    const pogingenRuw = contactAttempts(get(kolommen.wafu), get(kolommen.nietIngepland), opties);
    const pogingen = Math.min(pogingenRuw, opties.maxPogingenPerLead);

    const lead: LeadRow = {
      rij: i + 1,
      naam: naam.trim(),
      kleur,
      hex: rgb ? rgbToHex(rgb) : null,
      cellen: cells.map(cellText),
      pogingen,
      pogingenRuw,
    };
    tab.rijen.push(lead);
    tab.counts[kleur] += 1;
    tab.counts.pogingen += pogingen;

    if (kleur === "ongekleurd") {
      waarschuwingen.push({
        type: "ongekleurd",
        tab: tabName,
        rij: lead.rij,
        bericht: `"${lead.naam}" (rij ${lead.rij}) heeft geen herkenbare kleur${lead.hex ? ` (${lead.hex})` : ""}.`,
      });
    }
    if (pogingenRuw > opties.maxPogingenPerLead) {
      waarschuwingen.push({
        type: "te_veel_pogingen",
        tab: tabName,
        rij: lead.rij,
        bericht: `"${lead.naam}" (rij ${lead.rij}) heeft ${pogingenRuw} contactpogingen; er tellen er ${opties.maxPogingenPerLead} mee.`,
      });
    }
  }

  if (tab.rijen.length > 0 && tab.eigenTelling !== null && tab.eigenTelling !== tab.counts.groen) {
    waarschuwingen.push({
      type: "telling_wijkt_af",
      tab: tabName,
      bericht: `Tabblad "${tabName}": de setter telde zelf ${tab.eigenTelling}, het systeem telt ${tab.counts.groen} groen.`,
    });
  }

  if (tab.rijen.length === 0) {
    tab.overgeslagen = true;
    tab.reden = "Geen leadrijen";
  } else if (kolommen.wafu === null) {
    waarschuwingen.push({
      type: "kolom_ontbreekt",
      tab: tabName,
      bericht: `Tabblad "${tabName}": kolom "${HEADERS.wafu}" niet gevonden, contactpogingen zijn 0.`,
    });
  }

  return { tab, waarschuwingen };
}

export function parseSpreadsheet(
  data: ApiSpreadsheet,
  opties: ParserOptions = DEFAULT_PARSER_OPTIONS,
): ParseResult {
  const tabs: TabResult[] = [];
  const waarschuwingen: Warning[] = [];
  let totaal = emptyCounts();

  for (const sheet of data.sheets ?? []) {
    const r = parseTab(sheet, opties);
    tabs.push(r.tab);
    waarschuwingen.push(...r.waarschuwingen);
    if (!r.tab.overgeslagen) totaal = addCounts(totaal, r.tab.counts);
  }

  return {
    titel: (data.properties?.title ?? "").trim(),
    tabs,
    totaal,
    waarschuwingen,
    opties,
  };
}
