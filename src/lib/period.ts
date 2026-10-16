export const TIMEZONE = "Europe/Amsterdam";
export const PERIOD_DAY = 14;

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export interface PeriodRange {
  /** ISO-datum (YYYY-MM-DD) */
  start: string;
  eind: string;
  label: string;
}

/** Kalenderdatum en tijd in Europe/Amsterdam. */
export function amsterdamParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Maand verschuiven; month is 1-12. */
function shift(year: number, month: number, delta: number): [number, number] {
  const idx = year * 12 + (month - 1) + delta;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

export function periodLabel(start: string, eind: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = eind.split("-").map(Number);
  const s = `${sd} ${MONTHS[sm - 1]}`;
  const e = `${ed} ${MONTHS[em - 1]} ${ey}`;
  return sy === ey ? `${s} – ${e}` : `${s} ${sy} – ${e}`;
}

export function periodFromStart(start: string): PeriodRange {
  const [y, m] = start.split("-").map(Number);
  const [ey, em] = shift(y, m, 1);
  const eind = iso(ey, em, PERIOD_DAY);
  return { start, eind, label: periodLabel(start, eind) };
}

/**
 * De periode waarvoor wordt ingediend: de laatst afgelopen periode.
 * Indienen op of na de 14e → periode die op die 14e eindigde.
 * Indienen vóór de 14e → periode die op de 14e van vorige maand eindigde.
 */
export function periodForSubmission(date: Date): PeriodRange {
  const { year, month, day } = amsterdamParts(date);
  const [ey, em] = day >= PERIOD_DAY ? [year, month] : shift(year, month, -1);
  const [sy, sm] = shift(ey, em, -1);
  return periodFromStart(iso(sy, sm, PERIOD_DAY));
}
