import { describe, expect, it } from "vitest";
import { parseSpreadsheet, countLetterTokens, isLeadName, contactAttempts } from "@/lib/sheets/parser";
import { classifyHex } from "@/lib/sheets/colors";
import { DEFAULT_PARSER_OPTIONS, type ApiSpreadsheet } from "@/lib/sheets/types";
import { loadTestSpreadsheet } from "./helpers/fixture";

describe("testsheet 14 sept - 14 okt", () => {
  const result = parseSpreadsheet(loadTestSpreadsheet());
  const tab = (name: string) => result.tabs.find((t) => t.tab === name)!;

  it("leest de titel zonder spaties", () => {
    expect(result.titel).toBe("14 sept - 14 okt");
  });

  it("geeft de verwachte totalen", () => {
    expect(result.totaal).toMatchObject({ groen: 318, geel: 64, rood: 182, pogingen: 568 });
  });

  it("39 witte rijen = 24 ongekleurde leads + 15 eigen tellingen (geen leads)", () => {
    expect(result.totaal.ongekleurd).toBe(24);
    const tellingen = result.tabs.filter((t) => t.eigenTelling !== null);
    expect(tellingen).toHaveLength(15);
    expect(result.totaal.ongekleurd + tellingen.length).toBe(39);
  });

  it("waarschuwt als de eigen telling afwijkt van het aantal groen", () => {
    const afwijkend = result.waarschuwingen.filter((w) => w.type === "telling_wijkt_af");
    expect(afwijkend.map((w) => w.tab)).toEqual(["Solea HIFU"]);
    expect(tab("Solea HIFU").eigenTelling).toBe(44);
  });

  it.each([
    ["Babeau laseren", 26, 4, 14],
    ["Chia Skin Clinic", 31, 0, 1],
    ["Solea HIFU", 43, 4, 16],
  ])("telt %s: G%i / Y%i / R%i", (name, groen, geel, rood) => {
    expect(tab(name).counts).toMatchObject({ groen, geel, rood });
  });

  it("slaat lege tabs over", () => {
    for (const name of ["Harmonize", "clinic lara", "Kopie van Kopie van Kopie van Leeg"]) {
      expect(tab(name).overgeslagen).toBe(true);
    }
    expect(result.tabs.filter((t) => !t.overgeslagen)).toHaveLength(15);
  });

  it("telt de eigen telling onderaan een tab niet als lead", () => {
    expect(tab("Babeau laseren").rijen.some((r) => r.naam === "26")).toBe(false);
  });

  it("geeft een waarschuwing per ongekleurde rij", () => {
    expect(result.waarschuwingen.filter((w) => w.type === "ongekleurd")).toHaveLength(24);
  });

  it("bewaart ruwe rijdata per lead", () => {
    const sarah = tab("Babeau laseren").rijen.find((r) => r.naam === "sarah")!;
    expect(sarah).toMatchObject({ rij: 3, kleur: "groen", hex: "#34A853", pogingen: 2 });
    expect(sarah.cellen).toEqual(["sarah", "2x bellen", "Met WA opvolgen", "xx", ""]);
  });
});

describe("kleurclassificatie", () => {
  it.each([
    ["#34A853", "groen"],
    ["#FBBC04", "geel"],
    ["#FF9900", "geel"],
    ["#E69138", "geel"],
    ["#EA4335", "rood"],
    ["#FF0000", "rood"],
    ["#FFFFFF", "ongekleurd"],
    ["#4A86E8", "ongekleurd"],
    [null, "ongekleurd"],
  ] as const)("%s → %s", (hex, klasse) => {
    expect(classifyHex(hex)).toBe(klasse);
  });
});

describe("contactpogingen", () => {
  it.each([
    ["xxx", 3],
    ["xxx ", 3],
    ["xx 15--10 ", 2],
    ["x 15-10 ", 1],
    ["X x", 2],
    ["t", 0],
    ["", 0],
  ])("WAFU %j → %i", (v, n) => {
    expect(countLetterTokens(v, "x")).toBe(n);
  });

  it("telt t en Niet ingepland alleen als de optie aan staat", () => {
    const aan = { ...DEFAULT_PARSER_OPTIONS, wafuTTelt: true, nietIngeplandXTelt: true };
    expect(contactAttempts("t", "x", DEFAULT_PARSER_OPTIONS)).toBe(0);
    expect(contactAttempts("t", "x", aan)).toBe(2);
  });

  it("maximeert op 4 per lead en waarschuwt", () => {
    const sheet: ApiSpreadsheet = {
      properties: { title: "t" },
      sheets: [
        {
          properties: { title: "Tab" },
          data: [
            {
              rowData: [
                { values: [{ formattedValue: "WAFU" }, { formattedValue: "Naam Lead" }] },
                {
                  values: [
                    { formattedValue: "xxxxxx" },
                    { formattedValue: "Anna", effectiveFormat: { backgroundColor: { red: 0.2, green: 0.66, blue: 0.33 } } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const r = parseSpreadsheet(sheet);
    expect(r.tabs[0].rijen[0]).toMatchObject({ naam: "Anna", kleur: "groen", pogingen: 4, pogingenRuw: 6 });
    expect(r.waarschuwingen.map((w) => w.type)).toContain("te_veel_pogingen");
  });
});

describe("leadnaam", () => {
  it.each([
    ["loes", true],
    [" fleur ", true],
    ["26", false],
    ["1.234", false],
    ["", false],
    ["   ", false],
  ])("%j → %s", (v, ok) => {
    expect(isLeadName(v)).toBe(ok);
  });
});
