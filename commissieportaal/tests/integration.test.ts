import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: { to: unknown; subject: string }[] = [];
vi.mock("@/lib/mail/resend", () => ({ sendMail: async (m: { to: unknown; subject: string }) => (sent.push(m), { id: "x" }) }));

import { DEFAULT_SETTINGS } from "@/lib/settings";
import { approveSubmission, checklistsFor, opkomstInfo, saveClinicAnswers } from "@/lib/opkomst/server";
import { submitSheet } from "@/lib/submissions/submit";
import { supabaseSubmissionStore } from "@/lib/submissions/supabase-store";
import { db } from "@/lib/supabase/server";
import { loadTestSpreadsheet } from "./helpers/fixture";

const EMAIL = "zz-integratietest@voorbeeld.nl";
const SHEET = "https://docs.google.com/spreadsheets/d/1soGhXZ3cBCqEGMJPMp_Igr63bg8T75OAM6qiWPi8I0M/edit";
const deps = (now: string) => ({ store: supabaseSubmissionStore(db()), fetchSheet: async () => loadTestSpreadsheet(), now: () => new Date(now) });

async function cleanup() {
  const sb = db();
  const { data: s } = await sb.from("setters").select("id").eq("email", EMAIL).maybeSingle();
  if (!s) return;
  await sb.from("checklists").delete().eq("setter_id", s.id);
  await sb.from("attendance").delete().eq("setter_id", s.id);
  await sb.from("submissions").update({ replaced_by: null }).eq("setter_id", s.id).eq("status", "vervangen");
  await sb.from("submissions").delete().eq("setter_id", s.id);
  await sb.from("setters").delete().eq("id", s.id);
  await sb.from("periods").delete().eq("start", "2026-10-14").eq("eind", "2026-11-14");
}

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("integratie tegen echte database", () => {
  afterAll(cleanup);

  it("indienen → goedkeuren → kliniek vinkt af → bonus in volgende periode → uitbetaald", async () => {
    await cleanup();
    void DEFAULT_SETTINGS;

    // Periode 1
    const r1 = await submitSheet({ naam: "ZZ Test", email: EMAIL, sheetUrl: SHEET }, deps("2026-10-16T10:00:00Z"));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.details.commission.totaalCents).toBe(86100);

    const a1 = await approveSubmission(r1.submissionId);
    expect(a1.ok).toBe(true);
    expect(a1.nietGekoppeld?.map((u) => u.tab)).toEqual(["-"]);
    const { data: setter } = await db().from("setters").select("id").eq("email", EMAIL).single();
    const { data: p1 } = await db().from("periods").select("id").eq("start", "2026-09-14").single();
    const lists = await checklistsFor(setter!.id, p1!.id);
    expect(lists).toHaveLength(13);
    const babeau = lists.find((l) => l.clinic.naam === "Babeau Huidinstituut")!;
    expect(babeau.items_json).toHaveLength(48);
    expect(babeau.sent_to).toBe(process.env.ADMIN_EMAIL);
    expect(sent.some((m) => m.subject.startsWith("[TEST → info@babeauhuidinstituut.nl]"))).toBe(true);
    // Geen setterinfo naar de kliniek
    expect(JSON.stringify(babeau.items_json)).not.toContain("ZZ Test");

    // Kliniek: 30 ja, 10 nee, opslaan en indienen
    const ans = Object.fromEntries(babeau.items_json.map((i, n) => [i.id, n < 30 ? true : n < 40 ? false : null]));
    const s1 = await saveClinicAnswers(babeau.token, ans, false);
    expect(s1.ok).toBe(true);
    const s2 = await saveClinicAnswers(babeau.token, ans, true);
    expect(s2).toMatchObject({ ok: true, telling: { ja: 30, nee: 10, open: 8 } });
    expect(sent.some((m) => m.subject.includes("Babeau Huidinstituut heeft de opkomst ingediend: 30 van 48"))).toBe(true);

    // Periode 2: bonus 30 telt mee
    const r2 = await submitSheet({ naam: "ZZ Test", email: EMAIL, sheetUrl: SHEET }, deps("2026-11-16T10:00:00Z"));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.details.commission.opkomstAantal).toBe(30);
    expect(r2.details.commission.totaalCents).toBe(86100 + 3000);

    const { data: p2 } = await db().from("periods").select("id").eq("start", "2026-10-14").single();
    expect((await opkomstInfo(setter!.id, "2026-10-14", p2!.id)).aantal).toBe(30);

    const a2 = await approveSubmission(r2.submissionId);
    expect(a2.ok).toBe(true);
    const { data: att1 } = await db().from("attendance").select("*").eq("setter_id", setter!.id).eq("period_id", p1!.id).single();
    expect(att1).toMatchObject({ status: "uitbetaald", paid_in_period_id: p2!.id, approved_count: 30, clinic_checked_count: 30 });
    const { data: sub2 } = await db().from("submissions").select("status, commission_json").eq("id", r2.submissionId).single();
    expect(sub2!.status).toBe("goedgekeurd");
    expect(sub2!.commission_json.totaalCents).toBe(89100);

    // Lijsten van periode 1 op slot, kliniek kan niet meer aanpassen
    const locked = await saveClinicAnswers(babeau.token, ans, true);
    expect(locked).toMatchObject({ ok: false, status: 409 });

    // Nooit dubbel: bonus van periode 1 telt niet in periode 3
    expect((await opkomstInfo(setter!.id, "2026-11-14", "periode-3")).aantal).toBe(0);
  }, 120000);
});
