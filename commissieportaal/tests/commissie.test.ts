import { describe, expect, it } from "vitest";
import { gewenst, vergelijk, type AfspraakIn, type Bestaand, type Regel, type Regels } from "@/lib/crm/commissie";

const R: Regels = { basisCents: 50000, showCents: 1000, bonusDrempel: 30, bonusCents: 50000, closePercentage: 5 };
const S = { id: "s1", start_datum: "2026-10-12", actief: true, rol: "setter" };
const show = (i: number, extra: Partial<AfspraakIn> = {}): AfspraakIn => ({
  id: `a${i}`, contact_id: `c${i}`, type: "kennismaking", status: "verschenen", start_op: `2026-10-${String(15 + (i % 10)).padStart(2, "0")}T10:00:00Z`, setter_id: "s1", ...extra,
});
const sum = (rs: Regel[], soort: string) => rs.filter((r) => r.soort === soort).reduce((s, r) => s + r.bedrag_cents, 0);
const opslaan = (rs: Regel[]): Bestaand[] => rs.map((r, i) => ({ ...r, id: `id${i}`, status: "verdiend", gecorrigeerd_van: null }));

describe("commissiegrootboek", () => {
  it("show: precies €10, één keer per lead (verplaatsing of tweede gesprek telt niet)", () => {
    const rs = gewenst({
      setters: [S], regels: R, vandaag: "2026-10-30", deals: [],
      afspraken: [
        show(1),
        show(1, { id: "a1b", start_op: "2026-10-28T10:00:00Z" }),
        { ...show(1), id: "a1c", type: "salesgesprek" },
        show(2, { status: "no_show" }),
        show(3, { status: "geannuleerd" }),
        show(4, { status: "gepland" }),
      ],
    });
    expect(rs.filter((r) => r.soort === "show")).toHaveLength(1);
    expect(sum(rs, "show")).toBe(1000);
  });

  it("de 30e show activeert precies één bonus van €500; 60 shows nog steeds één", () => {
    const met = (n: number) => gewenst({ setters: [S], regels: R, vandaag: "2026-10-30", deals: [], afspraken: Array.from({ length: n }, (_, i) => show(i)) });
    expect(met(29).filter((r) => r.soort === "bonus")).toHaveLength(0);
    expect(met(30).filter((r) => r.soort === "bonus").map((r) => r.bedrag_cents)).toEqual([50000]);
    expect(met(60).filter((r) => r.soort === "bonus")).toHaveLength(1);
    expect(sum(met(30), "show")).toBe(30000);
  });

  it("geaccepteerde deal van €5.000 levert €250 closecommissie", () => {
    const rs = gewenst({ setters: [S], regels: R, vandaag: "2026-10-30", afspraken: [], deals: [{ id: "d1", contact_id: "c1", fase: "geaccepteerd", waarde_cents: 500000, sluitdatum: "2026-10-20", setter_id: "s1" }] });
    expect(rs.find((r) => r.soort === "close")).toMatchObject({ bedrag_cents: 25000, grondslag_cents: 500000, percentage: 5 });
    // Zonder sluitdatum of nog niet geaccepteerd: niets.
    expect(gewenst({ setters: [S], regels: R, vandaag: "2026-10-30", afspraken: [], deals: [{ id: "d1", contact_id: "c1", fase: "offerte", waarde_cents: 500000, sluitdatum: "2026-10-20", setter_id: "s1" }] }).some((r) => r.soort === "close")).toBe(false);
  });

  it("basisvergoeding per periode vanaf de startdatum", () => {
    const rs = gewenst({ setters: [S], regels: R, vandaag: "2026-12-01", afspraken: [], deals: [] });
    expect(rs.filter((r) => r.soort === "basis").map((r) => r.periode_start)).toEqual(["2026-10-12", "2026-11-14"]);
  });

  it("vergelijken is idempotent", () => {
    const doel = gewenst({ setters: [S], regels: R, vandaag: "2026-10-30", afspraken: [show(1)], deals: [] });
    expect(vergelijk([], doel, "2026-10-30").every((a) => a.soort === "toevoegen")).toBe(true);
    expect(vergelijk(opslaan(doel), doel, "2026-10-30")).toEqual([]);
  });

  it("waardewijziging na uitbetaling wordt een zichtbare correctie; onbetaald intrekken laat vervallen", () => {
    const deal = (w: number, fase = "geaccepteerd") => gewenst({ setters: [S], regels: R, vandaag: "2026-10-30", afspraken: [], deals: [{ id: "d1", contact_id: "c1", fase, waarde_cents: w, sluitdatum: "2026-10-20", setter_id: "s1" }] }).filter((r) => r.soort === "close");
    const betaald = opslaan(deal(500000)).map((b) => ({ ...b, status: "uitbetaald" as const }));
    const acties = vergelijk(betaald, deal(400000), "2026-11-20");
    expect(acties).toHaveLength(1);
    expect(acties[0]).toMatchObject({ soort: "correctie", regel: { bedrag_cents: -5000, periode_start: "2026-11-14" } });

    const onbetaald = opslaan(deal(500000));
    expect(vergelijk(onbetaald, deal(500000, "afgewezen"), "2026-10-30")).toEqual([{ soort: "vervallen", id: "id0", reden: "niet meer van toepassing" }]);
    // Na uitbetaling intrekken: negatieve correctie, regel blijft staan.
    expect(vergelijk(betaald, [], "2026-11-20")[0]).toMatchObject({ soort: "correctie", regel: { bedrag_cents: -25000 } });
  });

  it("show die achteraf no-show blijkt: vervalt als nog niet uitbetaald", () => {
    const doel = gewenst({ setters: [S], regels: R, vandaag: "2026-10-30", afspraken: [show(1)], deals: [] }).filter((r) => r.soort === "show");
    expect(vergelijk(opslaan(doel), [], "2026-10-30")).toEqual([{ soort: "vervallen", id: "id0", reden: "niet meer van toepassing" }]);
  });
});

import { createHmac } from "node:crypto";
import { geldigeHandtekening } from "@/lib/crm/calendly-sign";

describe("Calendly-webhookhandtekening", () => {
  const key = "geheim";
  const body = '{"event":"invitee.created"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
  it("accepteert een geldige en weigert een vervalste of oude handtekening", () => {
    expect(geldigeHandtekening(body, `t=${t},v1=${sig}`, key)).toBe(true);
    expect(geldigeHandtekening(body + " ", `t=${t},v1=${sig}`, key)).toBe(false);
    expect(geldigeHandtekening(body, `t=${t},v1=${sig}`, "ander")).toBe(false);
    expect(geldigeHandtekening(body, `t=${t},v1=${sig}`, key, (t + 600) * 1000)).toBe(false);
    expect(geldigeHandtekening(body, null, key)).toBe(false);
  });
});

import { geldigTwilio, voiceToken } from "@/lib/crm/twilio-sign";

describe("Twilio", () => {
  it("controleert webhookhandtekeningen", () => {
    const url = "https://commissie.gewoondoenmarketing.nl/api/twilio/status";
    const params = { CallSid: "CA1", CallStatus: "completed" };
    const sig = createHmac("sha1", "tok").update(url + "CallSidCA1CallStatuscompleted").digest("base64");
    expect(geldigTwilio("tok", url, params, sig)).toBe(true);
    expect(geldigTwilio("tok", url, { ...params, CallStatus: "busy" }, sig)).toBe(false);
  });
  it("maakt een geldig ondertekend voice-token", () => {
    const t = voiceToken({ accountSid: "AC1", apiKeySid: "SK1", apiKeySecret: "s", appSid: "AP1", identity: "setter-1", nu: 1_700_000_000_000 });
    const [h, p, sig] = t.split(".");
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ iss: "SK1", sub: "AC1", grants: { identity: "setter-1", voice: { outgoing: { application_sid: "AP1" } } } });
    expect(createHmac("sha256", "s").update(`${h}.${p}`).digest("base64url")).toBe(sig);
  });
});

import { beoordeelKanaal, isAfmelding } from "@/lib/crm/kanaal";

describe("kanaalcontrole WhatsApp/sms", () => {
  const basis = { kanaal: "whatsapp" as const, providerAan: true, nietBenaderen: false, heeftTelefoon: true, toestemming: null, laatsteInkomend: null, templateGoedgekeurd: true, nu: Date.parse("2026-10-20T12:00:00Z") };
  it("zonder toestemming geen WhatsApp, ook niet handmatig", () => {
    const b = beoordeelKanaal(basis);
    expect(b.api.ok).toBe(false);
    expect(b.handmatig.ok).toBe(false);
    expect(b.api.reden).toMatch(/geen geregistreerde/i);
  });
  it("met toestemming buiten het venster alleen via goedgekeurde template", () => {
    const t = { ...basis, toestemming: { status: "gegeven" as const, categorie: "marketing" } };
    expect(beoordeelKanaal(t).api).toMatchObject({ ok: true, modus: "template" });
    expect(beoordeelKanaal({ ...t, templateGoedgekeurd: false }).api.ok).toBe(false);
  });
  it("binnen 24 uur na inkomend bericht vrije tekst; na 24 uur niet meer", () => {
    expect(beoordeelKanaal({ ...basis, laatsteInkomend: "2026-10-20T01:00:00Z" }).api).toMatchObject({ ok: true, modus: "vrij" });
    expect(beoordeelKanaal({ ...basis, laatsteInkomend: "2026-10-19T11:00:00Z" }).api.ok).toBe(false);
  });
  it("afmelding en niet-meer-benaderen blokkeren alles; provider uit blokkeert alleen de API", () => {
    expect(beoordeelKanaal({ ...basis, toestemming: { status: "ingetrokken", categorie: "marketing" } }).handmatig.ok).toBe(false);
    expect(beoordeelKanaal({ ...basis, nietBenaderen: true, laatsteInkomend: "2026-10-20T11:00:00Z" }).handmatig.ok).toBe(false);
    const uit = beoordeelKanaal({ ...basis, providerAan: false, toestemming: { status: "gegeven", categorie: "marketing" } });
    expect([uit.api.ok, uit.handmatig.ok]).toEqual([false, true]);
    expect(isAfmelding("STOP")).toBe(true);
    expect(isAfmelding("stop maar met bellen, morgen beter")).toBe(false);
  });
});

import { controleerWachtwoord, hashWachtwoord, veiligPad } from "@/lib/auth/wachtwoord";

describe("beheerwachtwoord", () => {
  it("controleert hash en weigert fout wachtwoord of lege hash", () => {
    const h = hashWachtwoord("geheim-wachtwoord-1");
    expect(controleerWachtwoord("geheim-wachtwoord-1", h)).toBe(true);
    expect(controleerWachtwoord("geheim-wachtwoord-2", h)).toBe(false);
    expect(controleerWachtwoord("x", null)).toBe(false);
    expect(hashWachtwoord("a")).not.toBe(hashWachtwoord("a"));
  });
  it("laat alleen interne doorverwijzingen toe", () => {
    expect(veiligPad("/crm/instellingen")).toBe("/crm/instellingen");
    expect(veiligPad("//evil.com")).toBe("/crm");
    expect(veiligPad("https://evil.com")).toBe("/crm");
  });
});

describe("salesmedewerker als setter-tag", () => {
  it("levert geen commissie op", () => {
    const sales = { id: "r1", start_datum: "2026-10-01", actief: true, rol: "sales" };
    const rs = gewenst({ setters: [S, sales], regels: R, vandaag: "2026-10-30", afspraken: [show(1, { setter_id: "r1" })], deals: [{ id: "d1", contact_id: "c1", fase: "geaccepteerd", waarde_cents: 500000, sluitdatum: "2026-10-20", setter_id: "r1" }] });
    expect(rs.filter((r) => r.setter_id === "r1")).toEqual([]);
  });
});
