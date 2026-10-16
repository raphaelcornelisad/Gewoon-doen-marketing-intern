import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { NOT_PUBLIC_MESSAGE, SheetFetchError } from "@/lib/sheets/fetch";
import { submitSheet, type NewSubmission, type SubmissionStore } from "@/lib/submissions/submit";
import { loadTestSpreadsheet } from "./helpers/fixture";

const SHEET = "https://docs.google.com/spreadsheets/d/1soGhXZ3cBCqEGMJPMp_Igr63bg8T75OAM6qiWPi8I0M/edit";
const NOW = () => new Date("2026-10-16T10:00:00Z");

interface Row extends NewSubmission { id: string; status: string }

function memoryStore() {
  const setters: { id: string; naam: string; email: string }[] = [];
  const periods: { id: string; start: string; eind: string }[] = [];
  const submissions: Row[] = [];
  const attendance: Record<string, number> = {};
  let n = 0;
  const store: SubmissionStore = {
    getSettings: async () => DEFAULT_SETTINGS,
    findSetterByEmail: async (email) => setters.find((s) => s.email === email) ?? null,
    createSetter: async (naam, email) => {
      const s = { id: `s${setters.length + 1}`, naam, email };
      setters.push(s);
      return s;
    },
    ensurePeriod: async (p) => {
      let found = periods.find((x) => x.start === p.start && x.eind === p.eind);
      if (!found) periods.push((found = { id: `p${periods.length + 1}`, start: p.start, eind: p.eind }));
      return found;
    },
    activeSubmissionStatus: async (setterId, periodId) =>
      submissions.find((s) => s.setterId === setterId && s.periodId === periodId && s.status !== "vervangen")?.status ?? null,
    confirmedAttendance: async (setterId, eind) => attendance[`${setterId}:${eind}`] ?? 0,
    save: async (s) => {
      const old = submissions.find((x) => x.setterId === s.setterId && x.periodId === s.periodId && x.status !== "vervangen");
      if (old?.status === "goedgekeurd") return { result: "geblokkeerd", id: old.id };
      if (old) old.status = "vervangen";
      const row = { ...s, id: `sub${++n}`, status: "te_controleren" };
      submissions.push(row);
      return { result: old ? "vervangen" : "nieuw", id: row.id };
    },
  };
  return { store, setters, submissions, attendance };
}

describe("indienen", () => {
  let mem: ReturnType<typeof memoryStore>;
  const deps = () => ({ store: mem.store, fetchSheet: async () => loadTestSpreadsheet(), now: NOW });
  const input = { naam: "Sanne", email: "Sanne@Voorbeeld.nl ", sheetUrl: SHEET };

  beforeEach(() => {
    mem = memoryStore();
  });

  it("slaat een snapshot op en maakt een nieuwe setter aan", async () => {
    const r = await submitSheet(input, deps());
    expect(r).toMatchObject({ ok: true, vervangen: false, nieuweSetter: true });
    expect(mem.setters).toEqual([{ id: "s1", naam: "Sanne", email: "sanne@voorbeeld.nl" }]);
    const s = mem.submissions[0];
    expect(s.sheetTitle).toBe("14 sept - 14 okt");
    expect(s.counts.totaal).toMatchObject({ groen: 318, geel: 64, rood: 182, pogingen: 568 });
    expect(s.counts.perTab["Babeau laseren"]).toMatchObject({ groen: 26, geel: 4, rood: 14 });
    expect(s.commission.totaalCents).toBe(86100);
  });

  it("koppelt een bekende setter op e-mailadres", async () => {
    await submitSheet(input, deps());
    const r = await submitSheet({ ...input, email: "sanne@voorbeeld.nl" }, deps());
    expect(r).toMatchObject({ ok: true, nieuweSetter: false });
    expect(mem.setters).toHaveLength(1);
  });

  it("vervangt een nog niet goedgekeurde indiening", async () => {
    await submitSheet(input, deps());
    const r = await submitSheet(input, deps());
    expect(r).toMatchObject({ ok: true, vervangen: true });
    expect(mem.submissions.map((s) => s.status)).toEqual(["vervangen", "te_controleren"]);
  });

  it("blokkeert opnieuw indienen na goedkeuring", async () => {
    await submitSheet(input, deps());
    mem.submissions[0].status = "goedgekeurd";
    let fetched = false;
    const r = await submitSheet(input, { ...deps(), fetchSheet: async () => ((fetched = true), loadTestSpreadsheet()) });
    expect(r).toMatchObject({ ok: false, code: "al_goedgekeurd" });
    expect(fetched).toBe(false);
    expect(mem.submissions).toHaveLength(1);
  });

  it("telt bevestigde opkomst van de vorige periode mee", async () => {
    await submitSheet(input, deps());
    mem.attendance["s1:2026-09-14"] = 40;
    await submitSheet(input, deps());
    expect(mem.submissions[1].commission.totaalCents).toBe(86100 + 4000);
  });

  it("geeft een duidelijke melding als de sheet niet openbaar is", async () => {
    const r = await submitSheet(input, {
      ...deps(),
      fetchSheet: async () => {
        throw new SheetFetchError(NOT_PUBLIC_MESSAGE, "niet_openbaar");
      },
    });
    expect(r).toMatchObject({ ok: false, code: "niet_openbaar", field: "sheetUrl" });
    if (!r.ok) expect(r.message).toContain("Delen → Algemene toegang → Iedereen met de link → Lezer");
    expect(mem.setters).toHaveLength(0);
  });

  it.each([
    [{ naam: "" }, "naam"],
    [{ email: "geen-email" }, "email"],
    [{ sheetUrl: "https://example.com" }, "sheetUrl"],
  ])("valideert invoer %o", async (patch, field) => {
    const r = await submitSheet({ ...input, ...patch }, deps());
    expect(r).toMatchObject({ ok: false, code: "ongeldig", field });
  });

  it("weigert een sheet zonder leads", async () => {
    const r = await submitSheet(input, {
      ...deps(),
      fetchSheet: async () => ({ properties: { title: "Leeg" }, sheets: [{ properties: { title: "Blad1" }, data: [] }] }),
    });
    expect(r).toMatchObject({ ok: false, code: "geen_leads" });
  });
});
