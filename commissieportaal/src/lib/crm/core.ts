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
    { key: "klant", label: "Klant geworden" },
    { key: "niet_geinteresseerd", label: "Niet geïnteresseerd \"1\"" },
    { key: "niet_geinteresseerd_2", label: "Niet geïnteresseerd \"2\"" },
    { key: "niet_geinteresseerd_fuig", label: "Niet geïnteresseerd \"FU-IG\"" },
    { key: "ongeldig_nummer", label: "Ongeldig nummer" },
    { key: "niet_benaderen", label: "Afgewezen (geen contact)" },
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
  { key: "al_klant", label: "Is al klant", fase: "klant", bereikt: true },
  { key: "niet_benaderen", label: "Niet meer benaderen", fase: "niet_benaderen", bereikt: true },
] as const;
export type Uitkomst = (typeof UITKOMSTEN)[number]["key"];

export const isFase = (p: Pijplijn, f: string) => FASES[p].some((x) => x.key === f);
export const faseLabel = (p: Pijplijn, f: string) => FASES[p].find((x) => x.key === f)?.label ?? f;

/** Telefoonnummer → +31… (zelfde regels als de Calendly-klantsleutel). */
export function normPhone(v: string | null | undefined): string | null {
  if (!v || /^\s*-/.test(v)) return null; // negatief getal = kapotte cel
  const d = v
    .replace(/[^\d+]/g, "")
    .replace(/^00(?=[1-9])/, "+")
    .replace(/^310(?=\d{9}$)/, "+31")
    .replace(/^31(?=\d{9}$)/, "+31")
    .replace(/^31(?=97\d{9}$)/, "+31")
    .replace(/^32(?=\d{8,9}$)/, "+32")
    .replace(/^0(?=\d{9}$)/, "+31")
    .replace(/^(?=[1-9]\d{8}$)/, "+31"); // 9 cijfers zonder voorloopnul (Excel)
  return /^\+\d{10,13}$/.test(d) && !/^\+310/.test(d) ? d : null;
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
  /** Belstatus uit een eerder bewerkte lijst (bv. "Geen gehoor - Wafu") */
  status?: string | null;
  /** Notitie uit de lijst */
  notitie?: string | null;
  /** Rij is rood gemarkeerd in de sheet = geen contact opnemen */
  rood?: boolean;
}

type Veld = "salon_naam" | "contactpersoon" | "telefoon" | "email" | "website" | "adres" | "postcode" | "stad" | "provincie" | "type_bedrijf" | "behandelingen" | "bron_url" | "extern_id" | "status" | "notitie";

// Kopjes na normalisatie (kleine letters, alleen a-z0-9, spatie en -). Dekt eigen sheets, Outscraper en Apify.
const KOLOMMEN: Record<Veld, RegExp> = {
  salon_naam: /^(salon|salon ?naam|bedrijf|bedrijfsnaam|kliniek|clinic|naam salon|naam bedrijf|naam van bedrijf|business|business ?(name|mame)|name of business|company|company ?name|naam|name|title)$/,
  contactpersoon: /^(contactpersoon|eigenaar|eigenaresse|naam eigenaar|naam eigenaresse|owner|owner ?name|owner ?title|voornaam|naam contact)$/,
  telefoon: /^(telefoon|telefoonnummer|telefoon ?nummer|tel|nummer|mobiel|mobiel ?nummer|phone|phone ?1|phone ?number|phoneunformatted|contact|contact ?number|contactnummer|gsm)$/,
  email: /^(e[ -]?mail|mail|mali|e[ -]?mailadres|email ?adres|email ?address|e[ -]?mail ?address|email ?1|emails?)$/,
  website: /^(website|site|url ?website|web|domain)$/,
  adres: /^(adres|address|full ?address|fulladdress|straat|street)$/,
  postcode: /^(postcode|postal ?code|postalcode|zip)$/,
  stad: /^(stad|plaats|woonplaats|city|vestigingsplaats|gemeente)$/,
  provincie: /^(provincie|province|regio|state)$/,
  type_bedrijf: /^(type ?bedrijf|soort|type|category|categoryname|categorie)$/,
  behandelingen: /^(behandeling|behandelingen|type behandeling|dienst|diensten|niche|subtypes|categories|specialisaties)$/,
  bron_url: /^(bron|bron ?url|location ?link|locationlink|google ?maps ?url|url|maps ?url)$/,
  extern_id: /^(place ?id|placeid|google ?id|cid)$/,
  status: /^(status|belstatus|uitkomst|resultaat)$/,
  notitie: /^(notitie|notities|notes?|opmerking|opmerkingen)$/,
};

/** Placeholderwaarden uit websitebouwers (geen echte gegevens). */
const NEP = /(mysite\.com|yoursite\.|example\.|sitejet\.io|^123-?456-?7890$)/i;
const lijktTel = (v: string) => !v.includes("@") && (v.replace(/\D/g, "").length >= 8);
const lijktMail = (v: string) => /@/.test(v);

/** Belstatus uit een lijst → outbound-fase. Notitie "nummer niet in gebruik" → ongeldig nummer. */
export function faseUitStatus(status: string | null | undefined, notitie?: string | null): string {
  const s = (status ?? "").toLowerCase();
  const n = (notitie ?? "").toLowerCase();
  if (!s.trim()) return "nieuw";
  if (/klant geworden|is klant|al klant|oude klant|^klant/.test(s)) return "klant";
  if (/ingepland/.test(s)) return "ingepland";
  if (/geen interesse|geen match|niet geinteresseerd|niet geïnteresseerd/.test(s)) {
    return /niet in gebruik|niet beschikbaar|bestaat niet|ongeldig/.test(n) ? "ongeldig_nummer" : "niet_geinteresseerd";
  }
  if (/wafu|wavo|geen gehoor|niet opgenomen/.test(s)) return "wafu";
  if (/terugbel|opvolg|bel terug|later/.test(s)) return "terugbellen";
  if (/niet meer benaderen|afgemeld/.test(s)) return "niet_benaderen";
  return "nieuw";
}

/** Tabbladnaam opschonen: emoji's, enters en bekende tikfouten. */
export function schoonTab(tab: string): string {
  const t = tab.replace(/[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim();
  const alias: Record<string, string> = { leystad: "Lelystad", hertogenbosch: "'s-Hertogenbosch", "den bosch": "'s-Hertogenbosch" };
  return alias[t.toLowerCase()] ?? t;
}

const GENERIEKE_TAB = /^(blad|sheet|tabblad)\s*\d*$|^(leads?|leadlijst|data|import|export|csv)$/i;

const key = (s: string) => normalizeName(s).replace(/[_]/g, " ").replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, " ").trim();

/** Leest rijen (eerste rij met herkenbare kolommen = kop). Tabnaam wordt behandeling als die kolom ontbreekt. */
export function parseLeadRows(rows: string[][], tab = "", roodRij: boolean[] = []): { leads: ImportLead[]; reden: string | null } {
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
  // Kolommen op inhoud controleren: staat er in "telefoon" vooral e-mail (of andersom), dan omdraaien.
  const data = rows.slice(header + 1).filter((r) => r.some((c) => c?.trim()));
  const aandeel = (idx: number | undefined, f: (v: string) => boolean) => {
    if (idx === undefined) return 0;
    const vals = data.map((r) => (r[idx] ?? "").trim()).filter(Boolean);
    return vals.length ? vals.filter(f).length / vals.length : 0;
  };
  if (cols.telefoon !== undefined && cols.email !== undefined && aandeel(cols.telefoon, lijktMail) > 0.5 && aandeel(cols.email, lijktTel) > 0.5) {
    [cols.telefoon, cols.email] = [cols.email, cols.telefoon];
  }
  // Notitie zonder eigen kopje: de kolom direct na Status.
  if (cols.status !== undefined && cols.notitie === undefined) cols.notitie = cols.status + 1;
  const tabSchoon = schoonTab(tab);
  const tabIsPlaats = !!tabSchoon && !!provincieVoor(tabSchoon);
  const tabPlaats = tabIsPlaats ? tabSchoon.charAt(0).toUpperCase() + tabSchoon.slice(1) : null;
  const tabBehandeling = !tab || tabIsPlaats || GENERIEKE_TAB.test(tab.trim()) ? [] : splitBehandelingen(tab);
  const get = (r: string[], k: Veld) => (cols[k] === undefined ? "" : (r[cols[k]!] ?? "").trim());
  const leads: ImportLead[] = [];
  for (const [ri, r] of rows.slice(header + 1).entries()) {
    const salon = get(r, "salon_naam");
    if (!salon) continue;
    const stad = get(r, "stad") || tabPlaats;
    const beh = splitBehandelingen(get(r, "behandelingen"));
    const site = get(r, "website") || null;
    // Telefoon en e-mail per rij controleren: verkeerde kolom, placeholders, "callto:".
    let telRuw = get(r, "telefoon");
    let mailRuw = get(r, "email");
    if (lijktMail(telRuw) && !lijktMail(mailRuw)) [telRuw, mailRuw] = [mailRuw, telRuw];
    if (/^callto:/i.test(mailRuw)) {
      if (!telRuw) telRuw = mailRuw.replace(/^callto:/i, "");
      mailRuw = "";
    }
    if (NEP.test(telRuw)) telRuw = "";
    if (NEP.test(mailRuw)) mailRuw = "";
    const email = mailRuw.split(/[,;\s]+/).map(normEmail).find(Boolean) ?? null;
    leads.push({
      salon_naam: salon.replace(/:$/, "").trim(),
      contactpersoon: get(r, "contactpersoon") || null,
      telefoon: telRuw || null,
      telefoon_norm: normPhone(telRuw),
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
      status: get(r, "status") || null,
      notitie: get(r, "notitie") || null,
      rood: !!roodRij[header + 1 + ri],
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
    const rowData = sheet.data?.[0]?.rowData ?? [];
    const rows = rowData.map((r) => (r.values ?? []).map((c) => (c.formattedValue ?? "").trim()));
    // Rood gemarkeerde rij (eerste cel rood) = geen contact opnemen.
    const rood = rowData.map((r) => {
      const bg = r.values?.[0]?.effectiveFormat?.backgroundColor;
      return !!bg && (bg.red ?? 0) > 0.8 && (bg.green ?? 0) < 0.45 && (bg.blue ?? 0) < 0.45;
    });
    const r = parseLeadRows(rows, tab, rood);
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

/**
 * Ontdubbelt binnen de import. Telefoon is leidend (vestigingen van een keten met eigen nummer blijven apart);
 * zonder telefoon op e-mail, domein of naam+plaats. Bij een dubbel wordt een ontbrekende status/notitie aangevuld.
 */
export function dedupeLeads(leads: ImportLead[]): { uniek: ImportLead[]; dubbel: number } {
  const seen = new Map<string, ImportLead>();
  const uniek: ImportLead[] = [];
  let dubbel = 0;
  for (const l of leads) {
    const keys = (l.telefoon_norm ? [`t:${l.telefoon_norm}`] : [l.email && `e:${l.email}`, l.domein && `d:${l.domein}`, `n:${naamSleutel(l)}`]).filter(Boolean) as string[];
    const eerder = keys.map((k) => seen.get(k)).find(Boolean);
    if (eerder) {
      dubbel++;
      if (!eerder.status && l.status) eerder.status = l.status;
      if (l.notitie && l.notitie.trim() && !(eerder.notitie ?? "").includes(l.notitie.trim())) eerder.notitie = [eerder.notitie, l.notitie].filter((x) => x?.trim()).join("\n");
      if (!eerder.email && l.email) eerder.email = l.email;
      if (!eerder.contactpersoon && l.contactpersoon) eerder.contactpersoon = l.contactpersoon;
      continue;
    }
    keys.forEach((k) => seen.set(k, l));
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
