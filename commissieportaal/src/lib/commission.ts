import type { ColorClass, Counts } from "./sheets/types";

export interface CommissionSettings {
  adminFeeCents: number;
  perLeadCents: number;
  bonusPer100Cents: number;
  attendancePerLeadCents: number;
  countedColors: ColorClass[];
}

export const DEFAULT_COMMISSION_SETTINGS: CommissionSettings = {
  adminFeeCents: 15000,
  perLeadCents: 200,
  bonusPer100Cents: 2500,
  attendancePerLeadCents: 100,
  countedColors: ["groen"],
};

export interface CommissionLine {
  key: "admin" | "leads" | "staffel" | "opkomst";
  label: string;
  aantal: number;
  tariefCents: number;
  bedragCents: number;
}

export interface Commission {
  meetellendeLeads: number;
  opkomstAantal: number;
  regels: CommissionLine[];
  totaalCents: number;
  instellingen: CommissionSettings;
}

/**
 * Commissie = administratievergoeding
 *           + meetellende leads × tarief
 *           + staffelbonus × floor(meetellende leads / 100)
 *           + goedgekeurde opkomst vorige periode × tarief
 */
export function calculateCommission(
  counts: Pick<Counts, "groen" | "geel" | "rood" | "ongekleurd">,
  settings: CommissionSettings = DEFAULT_COMMISSION_SETTINGS,
  opkomstAantal = 0,
): Commission {
  const leads = settings.countedColors.reduce((sum, c) => sum + (counts[c] ?? 0), 0);
  const staffels = Math.floor(leads / 100);
  const regels: CommissionLine[] = [
    { key: "admin", label: "Administratievergoeding", aantal: 1, tariefCents: settings.adminFeeCents, bedragCents: settings.adminFeeCents },
    { key: "leads", label: "Leads", aantal: leads, tariefCents: settings.perLeadCents, bedragCents: leads * settings.perLeadCents },
    { key: "staffel", label: "Bonus per 100 leads", aantal: staffels, tariefCents: settings.bonusPer100Cents, bedragCents: staffels * settings.bonusPer100Cents },
    { key: "opkomst", label: "Opkomstbonus vorige periode", aantal: opkomstAantal, tariefCents: settings.attendancePerLeadCents, bedragCents: opkomstAantal * settings.attendancePerLeadCents },
  ];
  return {
    meetellendeLeads: leads,
    opkomstAantal,
    regels,
    totaalCents: regels.reduce((s, r) => s + r.bedragCents, 0),
    instellingen: settings,
  };
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}
