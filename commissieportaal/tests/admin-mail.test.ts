import { describe, expect, it } from "vitest";
import { calculateCommission } from "@/lib/commission";
import { buildAdminReviewMail } from "@/lib/mail/admin-review";
import { periodForSubmission } from "@/lib/period";
import { parseSpreadsheet } from "@/lib/sheets/parser";
import { loadTestSpreadsheet } from "./helpers/fixture";

describe("controlemail aan admin", () => {
  const parsed = parseSpreadsheet(loadTestSpreadsheet());
  const mail = buildAdminReviewMail(
    {
      setterNaam: "Sanne <script>",
      setterEmail: "sanne@voorbeeld.nl",
      periode: periodForSubmission(new Date("2026-10-16T10:00:00Z")),
      sheetUrl: "https://docs.google.com/spreadsheets/d/1soGhXZ3cBCqEGMJPMp_Igr63bg8T75OAM6qiWPi8I0M",
      parsed,
      commission: calculateCommission(parsed.totaal),
    },
    { submissionId: "abc", appUrl: "https://commissie.gewoondoenmarketing.nl/", vervangen: false, nieuweSetter: true },
  );

  it("noemt setter, periode en bedrag in het onderwerp", () => {
    expect(mail.subject).toContain("14 sep – 14 okt 2026");
    expect(mail.subject).toContain("861,00");
  });

  it("bevat sheettitel, totalen, berekening, waarschuwingen en link", () => {
    for (const s of [
      "14 sept - 14 okt",
      "Groen 318 · Geel 64 · Rood 182 · Ongekleurd 24 · Contactpogingen 568",
      "Babeau laseren: 26/4/14",
      "floor(318 / 100) = 3",
      "Eigen telling wijkt af · Solea HIFU",
      "WAARSCHUWINGEN (25)",
      "Overgeslagen: Harmonize, clinic lara, Kopie van Kopie van Kopie van Leeg",
      "https://commissie.gewoondoenmarketing.nl/admin/indiening/abc",
      "Nieuwe setter",
    ]) {
      expect(mail.text).toContain(s);
    }
    expect(mail.html).toContain("Moet gecontroleerd worden");
    expect(mail.html).toContain("/admin/indiening/abc");
  });

  it("escapet invoer van de setter in de HTML", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Sanne &lt;script&gt;");
  });
});
