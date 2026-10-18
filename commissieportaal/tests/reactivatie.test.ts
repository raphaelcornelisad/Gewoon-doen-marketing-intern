import { describe, expect, it } from "vitest";
import { buildReactivation, toCsv } from "@/lib/reactivatie/build";
import { parseSpreadsheet } from "@/lib/sheets/parser";
import { loadTestSpreadsheet } from "./helpers/fixture";

const parsed = parseSpreadsheet(loadTestSpreadsheet());
const clinics = [{ id: "babeau", naam: "Babeau Huidinstituut" }, { id: "solea", naam: "Soléa Instituut" }];
const koppeling = { "Babeau laseren": "babeau", "Babeau huid": "babeau", "Solea HIFU": "solea", "Solea laseren": "solea" };

describe("reactivatielijsten", () => {
  it("alleen groene leads, per salon, uit meerdere tabs", () => {
    const r = buildReactivation([{ titel: "okt", parsed }], clinics, koppeling);
    expect(r.perClinic.get("babeau")!.length).toBeLessThanOrEqual(48);
    expect(r.perClinic.get("babeau")!.length).toBeGreaterThan(40);
    expect(r.nietHerkend.some((u) => u.tab === "Chia Skin Clinic")).toBe(true);
  });
  it("dezelfde naam bij dezelfde salon komt één keer voor, ook over meerdere sheets", () => {
    const een = buildReactivation([{ titel: "okt", parsed }], clinics, koppeling);
    const twee = buildReactivation([{ titel: "okt", parsed }, { titel: "nov", parsed }], clinics, koppeling);
    expect(twee.perClinic.get("babeau")!.length).toBe(een.perClinic.get("babeau")!.length);
    expect(twee.dubbel).toBeGreaterThan(een.dubbel);
  });
  it("CSV met puntkomma en Ja/Nee", () => {
    const csv = toCsv([{ salon: "Babeau", naam: "Loes; L", campagne: "x", bron: "okt", verschenen: true }]);
    expect(csv).toContain('"Loes; L"');
    expect(csv).toContain(";Ja");
  });
});
