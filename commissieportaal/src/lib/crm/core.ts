import { normalizeName } from "../clinic-match";
import type { ApiSpreadsheet } from "../sheets/types";
import { provincieVoor } from "./provincies";

export type Pijplijn = "outbound" | "sales";

export const FASES: Record<Pijplijn, { key: string; label: string }[]> = {
  outbound: [
    { key: "nieuw", label: "Nieuw" },
    { key: "gebeld", label: "Gebeld" },
    { key: "wafu", label: "WAFU" },
    { key: "opvolgen", label: "Opvolgen" },
    { key: "ingepland", label: "Ingepland" },
    { key: "verloren", label: "Verloren" },
  ],
  sales: [
    { key: "ingepland", label: "Ingepland" },
    { key: "gesprek", label: "Gesprek gevoerd" },
    { key: "no_show", label: "No-show" },
    { key: "offerte", label: "Offerte" },
    { key: "gewonnen", label: "Gewonnen" },
    { key: "verloren", label: "Verloren" },
  ],
};

export const isFase = (p: Pijplijn, f: string) => FASES[p].some((x) => x.key === f);
export const faseLabel = (p: Pijplijn, f: string) => FASES[p].find((x) => x.key === f)?.label ?? f;

/** Telefoonnummer → +31… (zelfde regels als de Calendly-klantsleutel). */
export function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/[^\d+]/g, "").replace(/^0031/, "+31").replace(/^31(?=\d{9}$)/, "+31").replace(/^0(?=\d{9}$)/, "+31");
  return d.length >= 8 ? d : null;
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
  stad: string | null;
  provincie: string | null;
  behandelingen: string[];
}

const KOLOMMEN: Record<keyof Omit<ImportLead, "telefoon_norm">, RegExp> = {
  salon_naam: /^(salon|salon ?naam|bedrijf|bedrijfsnaam|kliniek|clinic|naam salon|naam bedrijf|business|company|naam)$/,
  contactpersoon: /^(contact|contactpersoon|eigenaar|eigenaresse|owner|voornaam|naam contact)$/,
  telefoon: /^(telefoon|telefoonnummer|telefoon ?nummer|tel|nummer|mobiel|mobiel ?nummer|phone|gsm)$/,
  email: /^(e[ -]?mail|mail|e[ -]?mailadres|email ?adres)$/,
  website: /^(website|site|url|web)$/,
  stad: /^(stad|plaats|woonplaats|city|vestigingsplaats|gemeente)$/,
  provincie: /^(provincie|province|regio)$/,
  behandelingen: /^(behandeling|behandelingen|type|type behandeling|categorie|dienst|diensten|niche)$/,
};

const GENERIEKE_TAB = /^(blad|sheet|tabblad)\s*\d*$|^(leads?|leadlijst|data|import|export)$/i;

const key = (s: string) => normalizeName(s).replace(/[^a-z0-9 -]/g, "").trim();

/**
 * Leest een leadlijst (Google Sheet). Per tabblad: eerste rij met een herkenbare kolom = kop.
 * Zonder kolom "behandeling" wordt de tabnaam de behandeling (tenzij die generiek is, zoals "Blad1").
 */
export function parseLeadSheet(s: ApiSpreadsheet): { leads: ImportLead[]; overgeslagen: { tab: string; reden: string }[] } {
  const leads: ImportLead[] = [];
  const overgeslagen: { tab: string; reden: string }[] = [];
  for (const sheet of s.sheets ?? []) {
    const tab = sheet.properties?.title ?? "";
    const rows = (sheet.data?.[0]?.rowData ?? []).map((r) => (r.values ?? []).map((c) => (c.formattedValue ?? "").trim()));
    let header = -1;
    let cols: Partial<Record<keyof typeof KOLOMMEN, number>> = {};
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const c: typeof cols = {};
      rows[i].forEach((v, idx) => {
        const k = key(v);
        for (const [veld, re] of Object.entries(KOLOMMEN) as [keyof typeof KOLOMMEN, RegExp][]) {
          if (c[veld] === undefined && re.test(k)) c[veld] = idx;
        }
      });
      if (c.salon_naam !== undefined && (c.telefoon !== undefined || c.email !== undefined || c.stad !== undefined)) {
        header = i;
        cols = c;
        break;
      }
    }
    if (header < 0) {
      overgeslagen.push({ tab, reden: "geen kopregel met salonnaam en telefoon/e-mail/stad" });
      continue;
    }
    const tabBehandeling = GENERIEKE_TAB.test(tab.trim()) ? [] : splitBehandelingen(tab);
    const get = (r: string[], k: keyof typeof KOLOMMEN) => (cols[k] === undefined ? "" : (r[cols[k]!] ?? "").trim());
    for (const r of rows.slice(header + 1)) {
      const salon = get(r, "salon_naam");
      if (!salon) continue;
      const stad = get(r, "stad") || null;
      const beh = splitBehandelingen(get(r, "behandelingen"));
      leads.push({
        salon_naam: salon,
        contactpersoon: get(r, "contactpersoon") || null,
        telefoon: get(r, "telefoon") || null,
        telefoon_norm: normPhone(get(r, "telefoon")),
        email: normEmail(get(r, "email")),
        website: get(r, "website") || null,
        stad,
        provincie: get(r, "provincie") || provincieVoor(stad),
        behandelingen: beh.length ? beh : tabBehandeling,
      });
    }
  }
  return { leads, overgeslagen };
}

/** Ontdubbelt binnen de import op telefoon, e-mail of salonnaam+stad. */
export function dedupeLeads(leads: ImportLead[]): { uniek: ImportLead[]; dubbel: number } {
  const seen = new Set<string>();
  const uniek: ImportLead[] = [];
  let dubbel = 0;
  for (const l of leads) {
    const keys = [l.telefoon_norm && `t:${l.telefoon_norm}`, l.email && `e:${l.email}`, `n:${key(l.salon_naam)}|${key(l.stad ?? "")}`].filter(Boolean) as string[];
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
