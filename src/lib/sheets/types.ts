// Minimale typen voor de respons van spreadsheets.get met de field mask
// properties.title,sheets.properties.title,sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)

export interface ApiColor {
  red?: number;
  green?: number;
  blue?: number;
  alpha?: number;
}

export interface ApiCell {
  formattedValue?: string;
  effectiveFormat?: { backgroundColor?: ApiColor };
}

export interface ApiSheet {
  properties?: { title?: string };
  data?: { rowData?: { values?: ApiCell[] }[] }[];
}

export interface ApiSpreadsheet {
  properties?: { title?: string };
  sheets?: ApiSheet[];
}

export type ColorClass = "groen" | "geel" | "rood" | "ongekleurd";

export const COLOR_CLASSES: ColorClass[] = ["groen", "geel", "rood", "ongekleurd"];

export interface ParserOptions {
  /** x in kolom "Niet ingepland" telt als contactpoging */
  nietIngeplandXTelt: boolean;
  /** "t" in WAFU telt als contactpoging */
  wafuTTelt: boolean;
  /** Maximum aantal contactpogingen per lead */
  maxPogingenPerLead: number;
}

export const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  nietIngeplandXTelt: false,
  wafuTTelt: false,
  maxPogingenPerLead: 4,
};

export interface Counts {
  groen: number;
  geel: number;
  rood: number;
  ongekleurd: number;
  pogingen: number;
}

export interface LeadRow {
  /** Rijnummer zoals in Google Sheets (1 = header) */
  rij: number;
  naam: string;
  kleur: ColorClass;
  hex: string | null;
  cellen: string[];
  /** Meegetelde contactpogingen (na maximum) */
  pogingen: number;
  /** Gevonden contactpogingen vóór het maximum */
  pogingenRuw: number;
}

export type ColumnKey = "naam" | "opgebeld" | "ingepland" | "wafu" | "nietIngepland";

export interface TabResult {
  tab: string;
  overgeslagen: boolean;
  reden?: string;
  header: string[];
  kolommen: Record<ColumnKey, number | null>;
  rijen: LeadRow[];
  counts: Counts;
  /** Getal onderaan de tab: de eigen telling van de setter (geen lead) */
  eigenTelling: number | null;
}

export type WarningType = "ongekleurd" | "te_veel_pogingen" | "kolom_ontbreekt" | "telling_wijkt_af";

export interface Warning {
  type: WarningType;
  tab: string;
  rij?: number;
  bericht: string;
}

export interface ParseResult {
  titel: string;
  tabs: TabResult[];
  totaal: Counts;
  waarschuwingen: Warning[];
  opties: ParserOptions;
}
