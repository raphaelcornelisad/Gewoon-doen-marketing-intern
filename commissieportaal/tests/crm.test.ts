import { describe, expect, it } from "vitest";
import { automatischVooruit, dedupeLeads, domeinVan, normPhone, parseCsv, parseEuro, parseLeadRows, parseLeadSheet, splitBehandelingen, vulTemplate } from "@/lib/crm/core";
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
    const base = { contactpersoon: null, telefoon: null, website: null, domein: null, adres: null, postcode: null, provincie: null, type_bedrijf: null, behandelingen: [], bron_url: null, extern_id: null };
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

  it("leest een Outscraper-CSV en een Apify-CSV", () => {
    const out = parseLeadRows(parseCsv('name,full_address,city,postal_code,phone,site,type,subtypes,email_1,place_id,location_link\n"Huid & Zo","Dorpsstraat 1, 3511 AA Utrecht",Utrecht,3511 AA,+31 30 123 4567,https://www.huidenzo.nl/,Schoonheidssalon,"Laser, Huidverbetering",info@huidenzo.nl,ChIJ123,https://maps.google.com/?cid=1\n'), "csv");
    expect(out.leads[0]).toMatchObject({ salon_naam: "Huid & Zo", telefoon_norm: "+31301234567", domein: "huidenzo.nl", email: "info@huidenzo.nl", type_bedrijf: "Schoonheidssalon", behandelingen: ["Laser", "Huidverbetering"], extern_id: "ChIJ123", provincie: "Utrecht", postcode: "3511 AA" });
    const apify = parseLeadRows(parseCsv("title;city;phone;website;categoryName;url\nSkin Lab;Amsterdam;020 1234567;skinlab.nl;Huidkliniek;https://www.google.com/maps/place/x\n"), "csv");
    expect(apify.leads[0]).toMatchObject({ salon_naam: "Skin Lab", domein: "skinlab.nl", type_bedrijf: "Huidkliniek", provincie: "Noord-Holland", bron_url: "https://www.google.com/maps/place/x" });
  });

  it("domein negeert social media en www", () => {
    expect(domeinVan("https://www.Babeau.nl/laser")).toBe("babeau.nl");
    expect(domeinVan("instagram.com/babeau")).toBeNull();
  });

  it("vult templates en schuift sales alleen automatisch vooruit", () => {
    expect(vulTemplate("Hoi {{voornaam}}, groet {{setter}}", { setter: "Mireille" })).toBe("Hoi, groet Mireille");
    expect(automatischVooruit("kennismaking", "salesgesprek")).toBe(true);
    expect(automatischVooruit("geaccepteerd", "salesgesprek")).toBe(false);
    expect(automatischVooruit("salesgesprek", "ingepland")).toBe(false);
  });
});

describe("import zoals de Dutch-leadlijst", () => {
  it("herkent Engelse kopjes, tabblad = plaats en telefoons zonder voorloopnul", () => {
    const r = parseLeadRows(
      [
        ["NAME OF BUSINESS", "Contact number", "EMAIL ADDRESS", "Status", "Notitie"],
        ["THE LAZER BAR", "31614434367", "info@thelaserbar.nl", "", ""],
        ["Your Laser Clinic", "702250669", "info@yourlaserclinic.nl", "", ""],
        ["Emori Skin Clinic", "-36597841", "info@emoriskinclinic.nl", "", ""],
        ["Lash & Laser Clinic", "06 48404020", "info@lashandlaserclinic.nl", "", ""],
        ["Gloow Rotterdam", "", "info@gloow.nl", "", ""],
      ],
      "rotterdam",
    );
    expect(r.leads.map((l) => l.telefoon_norm)).toEqual(["+31614434367", "+31702250669", null, "+31648404020", null]);
    expect(r.leads[0]).toMatchObject({ salon_naam: "THE LAZER BAR", email: "info@thelaserbar.nl", stad: "Rotterdam", provincie: "Zuid-Holland", behandelingen: [] });
  });
});

import { faseUitStatus, schoonTab } from "@/lib/crm/core";

describe("eerder bewerkte leadlijst (status/notitie)", () => {
  it("houten: mail en contact omgedraaid; status zonder kopje voor notitie", () => {
    const r = parseLeadRows(
      [
        ["business name ", "mail", "contact ", "Status"],
        ["Huidzorg Houten", "contact@huidzorghouten.nl", "030 63 42 561"],
        ["Saff. Clinics", "info@safflaserclinic.nl", "06 13231118", "Terugbelverzoek", "8-10 om 10:00 uur"],
      ],
      "houten",
    );
    expect(r.leads[0]).toMatchObject({ telefoon_norm: "+31306342561", email: "contact@huidzorghouten.nl", stad: "Houten" });
    expect(r.leads[1]).toMatchObject({ telefoon_norm: "+31613231118", status: "Terugbelverzoek", notitie: "8-10 om 10:00 uur" });
  });

  it("almere: lege kolom D, status in E; placeholders weg; emmen: naam eigenaar", () => {
    const a = parseLeadRows(
      [
        ["business name", "contact ", "Mail ", "", "Status"],
        ["no1 laser clinic", "06 847 545 60", "almere@no1laserclinic.nl", "", "Geen gehoor - Wafu"],
        ["Mindful Beauty House", "06 16 66 12 01", "info@mysite.com", "", "Ingepland "],
        ["City Beauty & Laser", "123-456-7890", "contact@mysite.com"],
        ["Asmterdam Skin Care", "", "callto:0683599113"],
      ],
      "almere",
    );
    expect(a.leads.map((l) => [l.telefoon_norm, l.email, l.status])).toEqual([
      ["+31684754560", "almere@no1laserclinic.nl", "Geen gehoor - Wafu"],
      ["+31616661201", null, "Ingepland"],
      [null, null, null],
      ["+31683599113", null, null],
    ]);
    const e = parseLeadRows([["business name", "contact ", "mail", "Status", "Notitie", "Naam eigenaar"], ["Salon La Bella's", "627031450", "salonlabellas@gmail.com", "Opvolgen", "Voor nu geen ruimte", "Esther"]], "emmen");
    expect(e.leads[0]).toMatchObject({ contactpersoon: "Esther", status: "Opvolgen", telefoon_norm: "+31627031450", provincie: "Drenthe" });
  });

  it("status → fase en tabnamen opschonen", () => {
    expect(faseUitStatus("Geen gehoor - Wafu")).toBe("wafu");
    expect(faseUitStatus("Geen interesse/geen match", "Nummer is niet in gebruik")).toBe("ongeldig_nummer");
    expect(faseUitStatus("Geen interesse/geen match", "Eigen marketing")).toBe("niet_geinteresseerd");
    expect(faseUitStatus("Terugbelverzoek")).toBe("terugbellen");
    expect(faseUitStatus("Opvolgen")).toBe("terugbellen");
    expect(faseUitStatus("Ingepland ")).toBe("ingepland");
    expect(faseUitStatus("")).toBe("nieuw");
    expect(schoonTab("Haarlem ⏳")).toBe("Haarlem");
    expect(schoonTab("\nede")).toBe("ede");
    expect(schoonTab("leystad")).toBe("Lelystad");
    expect(normPhone("310613431212")).toBe("+31613431212");
    expect(normPhone("3197010266402")).toBe("+3197010266402");
    expect(normPhone("31 (0)30-214 59 09")).toBe("+31302145909");
  });

  it("keten met hetzelfde nummer wordt één lead; status van de dubbel wordt aangevuld", () => {
    const base = { contactpersoon: null, telefoon: null, website: null, domein: null, adres: null, postcode: null, provincie: null, type_bedrijf: null, behandelingen: [], bron_url: null, extern_id: null };
    const r = dedupeLeads([
      { ...base, salon_naam: "Change Laserclinic", telefoon_norm: "+31202334531", email: "info@changelaserclinic.nl", stad: "Rotterdam", status: null, notitie: null },
      { ...base, salon_naam: "Change Laserclinic Zuid", telefoon_norm: "+31202334531", email: "info@changelaserclinic.nl", stad: "Amsterdam", status: "Geen interesse/geen match", notitie: "Intern marketing team" },
    ]);
    expect(r.uniek).toHaveLength(1);
    expect(r.uniek[0]).toMatchObject({ status: "Geen interesse/geen match", notitie: "Intern marketing team" });
  });
});
