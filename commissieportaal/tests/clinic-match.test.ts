import { describe, expect, it } from "vitest";
import { matchClinic, normalizeName, splitTabName } from "@/lib/clinic-match";

const clinics = [
  { id: "babeau", naam: "Babeau Huidinstituut" },
  { id: "solea", naam: "Soléa Instituut" },
  { id: "silk", naam: "Silk & Glow" },
  { id: "lara", naam: "Lara's Utrecht" },
  { id: "dali", naam: "Beauty Clinic Dali" },
];

describe("salon herkennen uit tabnaam", () => {
  it.each([
    ["Babeau Huidinstituut", "babeau", null],
    ["Babeau Huidinstituut - Laser", "babeau", "Laser"],
    ["babeau huidinstituut – HIFU", "babeau", "HIFU"],
    ["Solea Instituut - Laserontharen", "solea", "Laserontharen"],
    ["Silk and Glow - HIFU", "silk", "HIFU"],
    ["Silk & Glow", "silk", null],
    ["Lara's Utrecht", "lara", null],
  ])("%s → %s", (tab, id, behandeling) => {
    const m = matchClinic(tab, clinics);
    expect(m.clinic?.id).toBe(id);
    expect(m.behandeling).toBe(behandeling);
    expect(m.via).toBe("naam");
  });

  it("herkent geen afkortingen of losse woorden", () => {
    expect(matchClinic("Babeau laseren", clinics).clinic).toBeNull();
    expect(matchClinic("Dali", clinics).clinic).toBeNull();
    expect(matchClinic("-", clinics).clinic).toBeNull();
  });

  it("valt terug op een bestaande koppeling", () => {
    const m = matchClinic("Babeau laseren", clinics, { "Babeau laseren": "babeau" });
    expect(m).toMatchObject({ via: "koppeling", clinic: { id: "babeau" } });
  });

  it("streepje zonder spaties hoort bij de naam", () => {
    expect(splitTabName("Anne-Marie Beauty")).toEqual({ salon: "Anne-Marie Beauty", behandeling: null });
    expect(normalizeName("  Soléa  Instituut ")).toBe("solea instituut");
  });
});
