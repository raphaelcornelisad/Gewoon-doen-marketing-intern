/**
 * Acquisitie-setter (koude acquisitie via Calendly).
 * - Klant = uniek e-mailadres (anders telefoon). Herhaal-, vervolg- en verzette afspraken tellen niet extra.
 * - Een klant telt voor de setter als de EERSTE boeking ooit via haar UTM-code liep.
 * - Een klant telt in de periode waarin hij voor het eerst echt is verschenen
 *   (afspraak actief, al geweest, niet als no-show gemarkeerd). Een no-show telt nergens mee.
 * - Commissie: base fee + € per verschenen klant + eenmalige bonus bij X verschenen klanten + % over closes.
 */

export interface Meeting {
  id: string;
  start: string; // ISO
  status: "active" | "canceled";
  noShow: boolean;
  email: string | null;
  phone: string | null;
  naam: string;
  utmSource: string | null;
  eventName: string;
}

export interface AcqSettings {
  baseFeeCents: number;
  perVerschenenCents: number;
  bonusDrempel: number;
  bonusCents: number;
  closePercentage: number; // 5 = 5%
}

export const DEFAULT_ACQ_SETTINGS: AcqSettings = {
  baseFeeCents: 50000,
  perVerschenenCents: 1000,
  bonusDrempel: 30,
  bonusCents: 50000,
  closePercentage: 5,
};

export interface Client {
  key: string;
  naam: string;
  email: string | null;
  meetings: Meeting[];
  /** UTM-code van de eerste boeking ooit */
  eersteUtm: string | null;
  eersteBoeking: string;
  /** Eerste afspraak die echt heeft plaatsgevonden */
  verschenenOp: string | null;
}

export function clientKey(m: Pick<Meeting, "email" | "phone" | "naam">): string {
  const email = m.email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  const phone = m.phone?.replace(/[^\d+]/g, "").replace(/^0031/, "+31").replace(/^0(?=\d{9}$)/, "+31");
  if (phone) return `t:${phone}`;
  return `n:${m.naam.trim().toLowerCase()}`;
}

export function hasTakenPlace(m: Meeting, now: Date): boolean {
  return m.status === "active" && !m.noShow && new Date(m.start).getTime() <= now.getTime();
}

/** Bundelt afspraken per klant (oudste eerst). */
export function groupClients(meetings: Meeting[], now: Date): Client[] {
  const map = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const k = clientKey(m);
    map.set(k, [...(map.get(k) ?? []), m]);
  }
  return [...map.entries()].map(([key, ms]) => {
    const sorted = [...ms].sort((a, b) => a.start.localeCompare(b.start));
    const first = sorted[0];
    const shown = sorted.find((m) => hasTakenPlace(m, now));
    return {
      key,
      naam: first.naam,
      email: first.email,
      meetings: sorted,
      eersteUtm: first.utmSource?.trim().toLowerCase() || null,
      eersteBoeking: first.start,
      verschenenOp: shown?.start ?? null,
    };
  });
}

/** Klanten die bij deze setter horen: eerste boeking ooit via haar UTM-code, op of na haar startdatum. */
export function clientsForSetter(clients: Client[], utm: string, vanaf: string): Client[] {
  const code = utm.trim().toLowerCase();
  return clients.filter((c) => c.eersteUtm === code && c.eersteBoeking >= vanaf);
}

export interface Close {
  clientKey: string;
  bedragCents: number;
  gemarkeerdOp: string; // ISO
}

export interface AcqStatement {
  verschenen: Client[];
  closes: Close[];
  regels: { key: string; label: string; aantal: number; bedragCents: number; uitleg: string }[];
  totaalCents: number;
}

/** Periode: [start, eind) op datumniveau, bv. start '2026-10-12', eind '2026-11-14'. */
export const inPeriod = (iso: string, start: string, eind: string, toLocalDate: (iso: string) => string) => {
  const d = toLocalDate(iso);
  return d >= start && d < eind;
};

export function calculateStatement(
  setterClients: Client[],
  closes: Close[],
  periode: { start: string; eind: string },
  settings: AcqSettings,
  toLocalDate: (iso: string) => string,
): AcqStatement {
  const verschenen = setterClients.filter((c) => c.verschenenOp && inPeriod(c.verschenenOp, periode.start, periode.eind, toLocalDate));
  const keys = new Set(setterClients.map((c) => c.key));
  const periodeCloses = closes.filter((c) => keys.has(c.clientKey) && inPeriod(c.gemarkeerdOp, periode.start, periode.eind, toLocalDate));
  const closeTotaal = periodeCloses.reduce((s, c) => s + c.bedragCents, 0);
  const n = verschenen.length;
  const bonus = n >= settings.bonusDrempel;
  const regels = [
    { key: "base", label: "Base fee", aantal: 1, bedragCents: settings.baseFeeCents, uitleg: "vast per periode" },
    {
      key: "verschenen",
      label: "Verschenen klanten",
      aantal: n,
      bedragCents: n * settings.perVerschenenCents,
      uitleg: `${n} × €${(settings.perVerschenenCents / 100).toFixed(2).replace(".", ",")}`,
    },
    {
      key: "bonus",
      label: `Bonus bij ${settings.bonusDrempel} verschenen klanten`,
      aantal: bonus ? 1 : 0,
      bedragCents: bonus ? settings.bonusCents : 0,
      uitleg: bonus ? "drempel gehaald" : `nog ${settings.bonusDrempel - n} te gaan`,
    },
    {
      key: "close",
      label: `Closes (${settings.closePercentage}%)`,
      aantal: periodeCloses.length,
      bedragCents: Math.round((closeTotaal * settings.closePercentage) / 100),
      uitleg: `${settings.closePercentage}% van €${(closeTotaal / 100).toFixed(2).replace(".", ",")}`,
    },
  ];
  return { verschenen, closes: periodeCloses, regels, totaalCents: regels.reduce((s, r) => s + r.bedragCents, 0) };
}
