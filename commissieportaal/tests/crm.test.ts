import { describe, expect, it } from "vitest";
import { dedupeLeads, normPhone, parseEuro, parseLeadSheet, splitBehandelingen } from "@/lib/crm/core";
import { provincieVoor } from "@/lib/crm/provincies";
import type { ApiSpreadsheet } from "@/lib/sheets/types";

const sheet = (title: string, rows: string[][]): ApiSpreadsheet["sheets"] extends (infer T)[] | undefined ? T : never => ({
  properties: { title },
  data: [{ rowData: rows.map((r) => ({ values: r.map((v) => ({ formattedValue: v })) })) }],
});

describe("crm core", () => {
  it("normaliseert telefoonnummers", () => {
    expect(normPhone("06 12 34 56 78")).toBe("+31612345678");
    expect(normPhone("0031 6 12345678")).toBe("+31612345678");
    expect(normPhone("+31 (0)6") ).toBeNull();
  });

  it("vindt provincie bij stad", () => {
    expect(provincieVoor("Den Haag")).toBe("Zuid-Holland");
    expect(provincieVoor("  's-Hertogenbosch ")).toBe("Noord-Brabant");
    expect(provincieVoor("Leeuwarden")).toBe("Friesland");
    expect(provincieVoor("Onbekendorp")).toBeNull();
  });

  it("leest een leadlijst met kopregel en behandeling uit tabnaam", () => {
    const r = parseLeadSheet({
      sheets: [
        sheet("Laser", [["Salonnaam", "Telefoon", "Plaats", "E-mail"], ["Babeau", "0612345678", "Utrecht", "INFO@babeau.nl"], ["", "", "", ""]]),
        sheet("Blad1", [["Bedrijf", "Tel", "Stad", "Behandeling"], ["Skin Lab", "020-1234567", "Amsterdam", "Laser, Huid"]]),
        sheet("Notities", [["iets"], ["anders"]]),
      ],
    });
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0]).toMatchObject({ salon_naam: "Babeau", telefoon_norm: "+31612345678", email: "info@babeau.nl", provincie: "Utrecht", behandelingen: ["Laser"] });
    expect(r.leads[1]).toMatchObject({ provincie: "Noord-Holland", behandelingen: ["Laser", "Huid"] });
    expect(r.overgeslagen.map((o) => o.tab)).toEqual(["Notities"]);
  });

  it("ontdubbelt op telefoon, e-mail of naam+stad", () => {
    const base = { contactpersoon: null, telefoon: null, website: null, provincie: null, behandelingen: [] };
    const r = dedupeLeads([
      { ...base, salon_naam: "A", telefoon_norm: "+31611111111", email: null, stad: "X" },
      { ...base, salon_naam: "A2", telefoon_norm: "+31611111111", email: null, stad: "Y" },
      { ...base, salon_naam: "B", telefoon_norm: null, email: null, stad: "Utrecht" },
      { ...base, salon_naam: "b ", telefoon_norm: null, email: null, stad: "utrecht" },
      { ...base, salon_naam: "C", telefoon_norm: null, email: "c@c.nl", stad: null },
    ]);
    expect(r.uniek.map((l) => l.salon_naam)).toEqual(["A", "B", "C"]);
    expect(r.dubbel).toBe(2);
  });

  it("splitst behandelingen en leest bedragen", () => {
    expect(splitBehandelingen("laser; Laser / injectables")).toEqual(["Laser", "Injectables"]);
    expect(parseEuro("1.250,50")).toBe(125050);
    expect(parseEuro("€ 900")).toBe(90000);
    expect(parseEuro("1,250")).toBe(125000);
    expect(parseEuro("abc")).toBeNull();
  });
});
