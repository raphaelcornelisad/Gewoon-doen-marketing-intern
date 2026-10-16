import { describe, expect, it } from "vitest";
import { buildMonthlyMail, submitLink } from "@/lib/mail/monthly";
import { amsterdamParts, periodForSubmission } from "@/lib/period";

describe("maandmail aan setters", () => {
  const periode = periodForSubmission(new Date("2026-11-14T08:00:00Z"));
  const m = buildMonthlyMail("Mariska", "mariska.gewoondoenmarketing@gmail.com", periode, "https://commissie.gewoondoenmarketing.nl");

  it("gaat over de periode die die dag eindigt", () => {
    expect(periode.label).toBe("14 okt – 14 nov 2026");
    expect(m.subject).toBe("Lever je leadlijst in · 14 okt – 14 nov 2026");
  });

  it("bevat de link met vooringevuld e-mailadres", () => {
    const link = "https://commissie.gewoondoenmarketing.nl/indienen?email=mariska.gewoondoenmarketing%40gmail.com";
    expect(submitLink("https://commissie.gewoondoenmarketing.nl/", "mariska.gewoondoenmarketing@gmail.com")).toBe(link);
    expect(m.text).toContain(link);
    expect(m.html).toContain(link);
  });

  it("bevat geen bedragen", () => {
    expect(m.text).not.toMatch(/€/);
  });

  it("de 07:00 UTC-run is 09:00 in de zomer, de 08:00 UTC-run in de winter", () => {
    expect(amsterdamParts(new Date("2026-07-14T07:00:00Z")).hour).toBe(9);
    expect(amsterdamParts(new Date("2026-11-14T08:00:00Z")).hour).toBe(9);
    expect(amsterdamParts(new Date("2026-11-14T07:00:00Z")).hour).toBe(8);
  });
});
