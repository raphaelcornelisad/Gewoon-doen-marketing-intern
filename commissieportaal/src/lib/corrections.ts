import type { Counts } from "./sheets/types";

export const CORRECTABLE: { key: keyof Counts; label: string }[] = [
  { key: "groen", label: "Groen" },
  { key: "geel", label: "Geel" },
  { key: "rood", label: "Rood" },
  { key: "ongekleurd", label: "Ongekleurd" },
  { key: "pogingen", label: "Contactpogingen" },
];

export interface Correction {
  at: string;
  veld: keyof Counts;
  oud: number;
  nieuw: number;
  opmerking: string;
  door: string;
}

/** Originele tellingen met de laatste correctie per veld toegepast. Het origineel blijft ongewijzigd. */
export function effectiveCounts(origineel: Counts, corrections: Correction[] | null | undefined): Counts {
  const out = { ...origineel };
  for (const c of corrections ?? []) out[c.veld] = c.nieuw;
  return out;
}

export function validateCorrection(
  input: { veld?: unknown; nieuw?: unknown; opmerking?: unknown },
): { ok: true; veld: keyof Counts; nieuw: number; opmerking: string } | { ok: false; message: string } {
  const veld = CORRECTABLE.find((c) => c.key === input.veld)?.key;
  if (!veld) return { ok: false, message: "Kies wat je wilt corrigeren." };
  const nieuw = typeof input.nieuw === "number" ? input.nieuw : Number(input.nieuw);
  if (!Number.isInteger(nieuw) || nieuw < 0 || nieuw > 100000) return { ok: false, message: "Vul een heel getal van 0 of hoger in." };
  const opmerking = typeof input.opmerking === "string" ? input.opmerking.trim() : "";
  if (opmerking.length < 3) return { ok: false, message: "Een opmerking is verplicht." };
  return { ok: true, veld, nieuw, opmerking: opmerking.slice(0, 1000) };
}
