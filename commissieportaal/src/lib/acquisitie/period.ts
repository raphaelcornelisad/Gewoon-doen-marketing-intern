import { amsterdamParts, periodFromStart, periodLabel, type PeriodRange } from "../period";

/** Eerste periode van de acquisitie-setter is afwijkend; daarna gelijk aan de rest (14e tot 14e). */
export const ACQ_FIRST_PERIOD = { start: "2026-10-12", eind: "2026-11-14" };

export function acqPeriodFor(date: Date): PeriodRange {
  const { year, month, day } = amsterdamParts(date);
  const d = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (d >= ACQ_FIRST_PERIOD.start && d < ACQ_FIRST_PERIOD.eind) {
    return { ...ACQ_FIRST_PERIOD, label: periodLabel(ACQ_FIRST_PERIOD.start, ACQ_FIRST_PERIOD.eind) };
  }
  // Lopende periode: van de laatste 14e tot de volgende 14e.
  const [sy, sm] = day >= 14 ? [year, month] : month === 1 ? [year - 1, 12] : [year, month - 1];
  return periodFromStart(`${sy}-${String(sm).padStart(2, "0")}-14`);
}

export function amsterdamDate(iso: string): string {
  const { year, month, day } = amsterdamParts(new Date(iso));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
