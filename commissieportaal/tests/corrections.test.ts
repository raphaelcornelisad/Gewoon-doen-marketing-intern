import { describe, expect, it } from "vitest";
import { calculateCommission } from "@/lib/commission";
import { effectiveCounts, validateCorrection, type Correction } from "@/lib/corrections";

const origineel = { groen: 318, geel: 64, rood: 182, ongekleurd: 24, pogingen: 568 };
const c = (veld: Correction["veld"], nieuw: number): Correction => ({ at: "", veld, oud: 0, nieuw, opmerking: "x", door: "a" });

describe("correcties", () => {
  it("laatste correctie per veld telt, origineel blijft staan", () => {
    const eff = effectiveCounts(origineel, [c("groen", 320), c("geel", 60), c("groen", 322)]);
    expect(eff).toEqual({ ...origineel, groen: 322, geel: 60 });
    expect(origineel.groen).toBe(318);
  });
  it("commissie rekent met de gecorrigeerde tellingen", () => {
    expect(calculateCommission(effectiveCounts(origineel, [c("groen", 300)])).totaalCents).toBe(15000 + 60000 + 7500);
  });
  it("opmerking is verplicht en getal moet geldig zijn", () => {
    expect(validateCorrection({ veld: "groen", nieuw: 300, opmerking: "" }).ok).toBe(false);
    expect(validateCorrection({ veld: "groen", nieuw: -1, opmerking: "fout" }).ok).toBe(false);
    expect(validateCorrection({ veld: "onzin", nieuw: 1, opmerking: "fout" }).ok).toBe(false);
    expect(validateCorrection({ veld: "groen", nieuw: "300", opmerking: " 2 rijen dubbel " })).toEqual({ ok: true, veld: "groen", nieuw: 300, opmerking: "2 rijen dubbel" });
  });
});
