import { describe, expect, it } from "vitest";
import { calculateCommission, DEFAULT_COMMISSION_SETTINGS } from "@/lib/commission";

const counts = { groen: 318, geel: 64, rood: 182, ongekleurd: 39 };

describe("commissie", () => {
  it("testsheet zonder opkomstbonus: 150 + 636 + 75 = €861", () => {
    const c = calculateCommission(counts);
    expect(c.regels.map((r) => r.bedragCents)).toEqual([15000, 63600, 7500, 0]);
    expect(c.totaalCents).toBe(86100);
  });

  it("telt de opkomstbonus van de vorige periode mee", () => {
    expect(calculateCommission(counts, DEFAULT_COMMISSION_SETTINGS, 40).totaalCents).toBe(90100);
  });

  it("staffelbonus per volle 100", () => {
    expect(calculateCommission({ ...counts, groen: 99 }).regels[2].bedragCents).toBe(0);
    expect(calculateCommission({ ...counts, groen: 100 }).regels[2].bedragCents).toBe(2500);
  });

  it("respecteert de meetellende kleuren", () => {
    const c = calculateCommission(counts, { ...DEFAULT_COMMISSION_SETTINGS, countedColors: ["groen", "geel"] });
    expect(c.meetellendeLeads).toBe(382);
    expect(c.totaalCents).toBe(15000 + 382 * 200 + 3 * 2500);
  });
});
