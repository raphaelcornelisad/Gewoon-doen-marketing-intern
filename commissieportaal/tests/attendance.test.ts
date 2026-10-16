import { describe, expect, it } from "vitest";
import { applyAnswers, buildChecklistItems, countAnswers, opkomstVoorPeriode, type ChecklistItem } from "@/lib/attendance";
import { parseSpreadsheet } from "@/lib/sheets/parser";
import { loadTestSpreadsheet } from "./helpers/fixture";

const snap = parseSpreadsheet(loadTestSpreadsheet());

describe("afvinklijsten", () => {
  const map = { "Babeau laseren": "babeau", "Babeau huid": "babeau", "Solea HIFU": "solea", "Solea laseren": "solea" };
  const { perClinic, unmapped } = buildChecklistItems(snap, map);

  it("bundelt meerdere tabs naar één kliniek met alleen groene leads", () => {
    expect(perClinic.get("babeau")).toHaveLength(26 + 22);
    expect(perClinic.get("solea")).toHaveLength(43 + 12);
    expect(new Set(perClinic.get("babeau")!.map((i) => i.campagne))).toEqual(new Set(["Babeau laseren", "Babeau huid"]));
    expect(perClinic.get("babeau")!.every((i) => i.verschenen === null)).toBe(true);
  });

  it("meldt tabs zonder kliniek", () => {
    expect(unmapped.map((u) => u.tab)).toContain("Chia Skin Clinic");
    expect(unmapped.find((u) => u.tab === "Chia Skin Clinic")?.groen).toBe(31);
  });

  it("totaal groen = afvinkbare leads + niet-gekoppelde leads", () => {
    const mapped = [...perClinic.values()].reduce((s, l) => s + l.length, 0);
    expect(mapped + unmapped.reduce((s, u) => s + u.groen, 0)).toBe(318);
  });
});

describe("antwoorden", () => {
  const items: ChecklistItem[] = [
    { id: "a", naam: "A", campagne: "x", verschenen: null },
    { id: "b", naam: "B", campagne: "x", verschenen: null },
    { id: "c", naam: "C", campagne: "x", verschenen: null },
  ];
  it("verwerkt ja/nee/leeg en negeert rommel", () => {
    const r = applyAnswers(items, { a: true, b: false, c: "ja", z: true });
    expect(r.map((i) => i.verschenen)).toEqual([true, false, null]);
    expect(countAnswers(r)).toEqual({ ja: 1, nee: 1, open: 1, totaal: 3 });
  });
});

describe("opkomstbonus", () => {
  const yes = (n: number): ChecklistItem[] => Array.from({ length: n }, (_, i) => ({ id: `${i}`, naam: "x", campagne: "y", verschenen: true }));
  const prev = { id: "att", status: "open" as const, max_count: 50, approved_count: null, paid_in_period_id: null };

  it("telt de Ja's van alle klinieken", () => {
    expect(opkomstVoorPeriode(prev, [yes(10), yes(5)], "p2")).toEqual({ aantal: 15, bron: "klinieken" });
  });
  it("gebruikt het aantal van de admin als dat is vastgesteld", () => {
    expect(opkomstVoorPeriode({ ...prev, approved_count: 12 }, [yes(30)], "p2")).toEqual({ aantal: 12, bron: "admin" });
  });
  it("nooit meer dan het aantal groen van die periode", () => {
    expect(opkomstVoorPeriode({ ...prev, max_count: 3 }, [yes(10)], "p2").aantal).toBe(3);
  });
  it("telt nooit twee keer: al uitbetaald in een andere periode = 0", () => {
    expect(opkomstVoorPeriode({ ...prev, status: "uitbetaald", paid_in_period_id: "p2" }, [yes(10)], "p3")).toEqual({ aantal: 0, bron: "al_uitbetaald" });
  });
  it("geen vorige periode = 0", () => {
    expect(opkomstVoorPeriode(null, [], "p1").aantal).toBe(0);
  });
});
