import { normalizeName } from "../clinic-match";
import type { ApiSpreadsheet } from "../sheets/types";
import { provincieVoor } from "./provincies";

export type Pijplijn = "outbound" | "sales";

export const FASES: Record<Pijplijn, { key: string; label: string }[]> = {
  outbound: [
    { key: "nieuw", label: "Nieuw" },
    { key: "niet_opgenomen", label: "Gebeld – niet opgenomen" },
    { key: "wafu", label: "WAFU" },
    { key: "terugbellen", label: "Terugbellen" },
    { key: "in_gesprek", label: "In gesprek" },
    { key: "ingepland", label: "Ingepland – naar sales" },
    { key: "niet_geinteresseerd", label: "Niet geïnteresseerd" },
    { key: "ongeldig_nummer", label: "Ongeldig nummer" },
    { key: "niet_benaderen", label: "Niet meer benaderen" },
  ],
  sales: [
    { key: "ingepland", label: "Ingepland" },
    { key: "kennismaking", label: "Kennismakingsgesprek" },
    { key: "salesgesprek", label: "Salesgesprek" },
    { key: "offerte", label: "Offerte opgestuurd" },
    { key: "geaccepteerd", label: "Geaccepteerd" },
    { key: "afgewezen", label: "Afgewezen" },
    { key: "opvolgen", label: "Opvolgen" },
  ],
};

/** Fases waarin een lead nog in de belwachtrij hoort. */
export const BELBAAR = ["nieuw", "niet_opgenomen", "wafu", "terugbellen"];

/** Volgorde in sales; automatische updates (agenda) schuiven alleen vooruit en nooit uit een eindfase. */
export const SALES_RANG: Record<string, number> = { ingepland: 0, opvolgen: 1, kennismaking: 1, salesgesprek: 2, offerte: 3, geaccepteerd: 9, afgewezen: 9 };
export const salesEindfase = (f: string) => f === "geaccepteerd" || f === "afgewezen";
export function automatischVooruit(huidig: string, nieuw: string): boolean {
  if (salesEindfase(huidig)) return false;
  return (SALES_RANG[nieuw] ?? 0) > (SALES_RANG[huidig] ?? 0);
}

/** Uitkomstknoppen in het belscherm → outbound-fase. */
export const UITKOMSTEN = [
  { key: "niet_opgenomen", label: "Niet opgenomen", fase: "niet_opgenomen", bereikt: false },
  { key: "terugbellen", label: "Terugbellen", fase: "terugbellen", bereikt: true },
  { key: "wafu", label: "Opvolgen via WhatsApp", fase: "wafu", bereikt: true },
  { key: "geinteresseerd", label: "Geïnteresseerd", fase: "in_gesprek", bereikt: true },
  { key: "ingepland", label: "Ingepland", fase: null, bereikt: true },
  { key: "niet_geinteresseerd", label: "Niet geïnteresseerd", fase: "niet_geinteresseerd", bereikt: true },
  { key: "ongeldig_nummer", label: "Ongeldig nummer", fase: "ongeldig_nummer", bereikt: false },
  { key: "niet_benaderen", label: "Niet meer benaderen", fase: "niet_benaderen", bereikt: true },
] as const;
export type Uitkomst = (typeof UITKOMSTEN)[number]["key"];

export const isFase = (p: Pijplijn, f: string) => FASES[p].some((x) => x.key === f);
export const faseLabel = (p: Pijplijn, f: string) => FASES[p].find((x) => x.key === f)?.label ?? f;

/** Telefoonnummer → +31… (zelfde regels als de Calendly-klantsleutel). */
export function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/[^\d+]/g, "").replace(/^0031/, "+31").replace(/^31(?=\d{9}$)/, "+31").replace(/^0(?=\d{9}$)/, "+31");
  return d.length >= 8 ? d : null;
}

/** Domein uit een website (zonder www.), voor ontdubbelen. */
export function domeinVan(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return /\./.test(h) && !/(facebook|instagram|google|linktr|wa\.me|treatwell|salonized)\./.test(h) ? h : null;
  } catch {
    return null;
  }
}

/** Vult {{variabelen}} in een berichttemplate. Onbekende variabelen worden leeg. */
export function vulTemplate(tekst: string, v: Record<string, string | null | undefined>): string {
  return tekst.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => v[k]?.trim() ?? "").replace(/ +([,.!?])/g, "$1").replace(/  +/g, " ").trim();
}

export function normEmail(v: string | null | undefined): string | null {
  const e = v?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** "Laser, Injectables / huid" → ["Laser","Injectables","Huid"] */
export function splitBehandelingen(v: string | null | undefined): string[] {
  if (!v) return [];
  const out: string[] = [];
  for (const raw of v.split(/[,;/|\n]+/)) {
    const s = raw.trim().replace(/\s+/g, " ");
    if (!s) continue;
    const nice = s.charAt(0).toUpperCase() + s.slice(1);
    if (!out.some((x) => x.toLowerCase() === nice.toLowerCase())) out.push(nice);
  }
  return out;
}

export interface ImportLead {
  salon_naam: string;
  contactpersoon: string | null;
  telefoon: string | null;
  telefoon_norm: string | null;
  email: string | null;
  website: string | null;
  domein: string | null;
  adres: string | null;
  postcode: string | null;
  stad: string | null;
  provincie: string | null;
  type_bedrijf: string | null;
  behandelingen: string[];
  bron_url: string | null;
  extern_id: string | null;
}

type Veld = "salon_naam" | "contactpersoon" | "telefoon" | "email" | "website" | "adres" | "postcode" | "stad" | "provincie" | "type_bedrijf" | "behandelingen" | "bron_url" | "extern_id";

// Kopjes na normalisatie (kleine letters, alleen a-z0-9, spatie en -). Dekt eigen sheets, Outscraper en Apify.
const KOLOMMEN: Record<Veld, RegExp> = {
  salon_naam: /^(salon|salon ?naam|bedrijf|bedrijfsnaam|kliniek|clinic|naam salon|naam bedrijf|business|company|naam|name|title)$/,
  contactpersoon: /^(contact|contactpersoon|eigenaar|eigenaresse|owner|owner ?title|voornaam|naam contact)$/,
  telefoon: /^(telefoon|telefoonnummer|telefoon ?nummer|tel|nummer|mobiel|mobiel ?nummer|phone|phone ?1|phoneunformatted|gsm)$/,
  email: /^(e[ -]?mail|mail|e[ -]?mailadres|email ?adres|email ?1|emails?)$/,
  website: /^(website|site|url ?website|web|domain)$/,
  adres: /^(adres|address|full ?address|fulladdress|straat|street)$/,
  postcode: /^(postcode|postal ?code|postalcode|zip)$/,
  stad: /^(stad|plaats|woonplaats|city|vestigingsplaats|gemeente)$/,
  provincie: /^(provincie|province|regio|state)$/,
  type_bedrijf: /^(type ?bedrijf|soort|type|category|categoryname|categorie)$/,
  behandelingen: /^(behandeling|behandelingen|type behandeling|dienst|diensten|niche|subtypes|categories|specialisaties)$/,
  bron_url: /^(bron|bron ?url|location ?link|locationlink|google ?maps ?url|url|maps ?url)$/,
  extern_id: /^(place ?id|placeid|google ?id|cid)$/,
};

const GENERIEKE_TAB = /^(blad|sheet|tabblad)\s*\d*$|^(leads?|leadlijst|data|import|export|csv)$/i;

const key = (s: string) => normalizeName(s).replace(/[_]/g, " ").replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, " ").trim();

/** Leest rijen (eerste rij met herkenbare kolommen = kop). Tabnaam wordt behandeling als die kolom ontbreekt. */
export function parseLeadRows(rows: string[][], tab = ""): { leads: ImportLead[]; reden: string | null } {
  let header = -1;
  let cols: Partial<Record<Veld, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const c: typeof cols = {};
    rows[i].forEach((v, idx) => {
      const k = key(v);
      for (const [veld, re] of Object.entries(KOLOMMEN) as [Veld, RegExp][]) {
        if (c[veld] === undefined && re.test(k)) {
          c[veld] = idx;
          break;
        }
      }
    });
    if (c.salon_naam !== undefined && (c.telefoon !== undefined || c.email !== undefined || c.stad !== undefined || c.website !== undefined)) {
      header = i;
      cols = c;
      break;
    }
  }
  if (header < 0) return { leads: [], reden: "geen kopregel met bedrijfsnaam en telefoon/e-mail/stad/website" };
  const tabBehandeling = !tab || GENERIEKE_TAB.test(tab.trim()) ? [] : splitBehandelingen(tab);
  const get = (r: string[], k: Veld) => (cols[k] === undefined ? "" : (r[cols[k]!] ?? "").trim());
  const leads: ImportLead[] = [];
  for (const r of rows.slice(header + 1)) {
    const salon = get(r, "salon_naam");
    if (!salon) continue;
    const stad = get(r, "stad") || null;
    const beh = splitBehandelingen(get(r, "behandelingen"));
    const site = get(r, "website") || null;
    const email = get(r, "email").split(/[,;\s]+/).map(normEmail).find(Boolean) ?? null;
    leads.push({
      salon_naam: salon,
      contactpersoon: get(r, "contactpersoon") || null,
      telefoon: get(r, "telefoon") || null,
      telefoon_norm: normPhone(get(r, "telefoon")),
      email,
      website: site,
      domein: domeinVan(site),
      adres: get(r, "adres") || null,
      postcode: get(r, "postcode") || null,
      stad,
      provincie: get(r, "provincie") && PROVINCIE_NAMEN.test(get(r, "provincie")) ? get(r, "provincie") : provincieVoor(stad),
      type_bedrijf: get(r, "type_bedrijf") || null,
      behandelingen: beh.length ? beh : tabBehandeling,
      bron_url: /^https?:/.test(get(r, "bron_url")) ? get(r, "bron_url") : null,
      extern_id: get(r, "extern_id") || null,
    });
  }
  return { leads, reden: null };
}

const PROVINCIE_NAMEN = /^(groningen|friesland|frysl[aâ]n|drenthe|overijssel|flevoland|gelderland|utrecht|noord-holland|zuid-holland|zeeland|noord-brabant|limburg)$/i;

/** Google Sheet → leads, per tabblad. */
export function parseLeadSheet(s: ApiSpreadsheet): { leads: ImportLead[]; overgeslagen: { tab: string; reden: string }[] } {
  const leads: ImportLead[] = [];
  const overgeslagen: { tab: string; reden: string }[] = [];
  for (const sheet of s.sheets ?? []) {
    const tab = sheet.properties?.title ?? "";
    const rows = (sheet.data?.[0]?.rowData ?? []).map((r) => (r.values ?? []).map((c) => (c.formattedValue ?? "").trim()));
    const r = parseLeadRows(rows, tab);
    if (r.reden) overgeslagen.push({ tab, reden: r.reden });
    leads.push(...r.leads);
  }
  return { leads, overgeslagen };
}

/** CSV (komma, puntkomma of tab; aanhalingstekens volgens RFC 4180). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const eersteRegel = t.slice(0, t.indexOf("\n") >= 0 ? t.indexOf("\n") : t.length);
  const sep = [",", ";", "\t"].map((c) => [c, eersteRegel.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cel = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cel += '"';
          i++;
        } else q = false;
      } else cel += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cel);
      cel = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cel);
      rows.push(row);
      row = [];
      cel = "";
    } else cel += ch;
  }
  if (cel || row.length) {
    row.push(cel);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export const naamSleutel = (l: { salon_naam: string; stad: string | null }) => `${key(l.salon_naam)}|${key(l.stad ?? "")}`;

/** Ontdubbelt binnen de import op telefoon, e-mail, domein of salonnaam+stad. */
export function dedupeLeads(leads: ImportLead[]): { uniek: ImportLead[]; dubbel: number } {
  const seen = new Set<string>();
  const uniek: ImportLead[] = [];
  let dubbel = 0;
  for (const l of leads) {
    const keys = [l.telefoon_norm && `t:${l.telefoon_norm}`, l.email && `e:${l.email}`, l.domein && `d:${l.domein}`, `n:${naamSleutel(l)}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) {
      dubbel++;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    uniek.push(l);
  }
  return { uniek, dubbel };
}

/** Euro-invoer ("1.250,50", "1250", "€ 900") → centen. */
export function parseEuro(v: string): number | null {
  const s = v.replace(/[€\s]/g, "");
  if (!s) return null;
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
