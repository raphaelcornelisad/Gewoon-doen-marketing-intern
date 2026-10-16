import { describe, expect, it } from "vitest";
import { periodForSubmission, amsterdamParts } from "@/lib/period";

describe("periode", () => {
  it.each([
    ["2026-10-16T10:00:00Z", "2026-09-14", "2026-10-14", "14 sep – 14 okt 2026"],
    ["2026-10-14T07:00:00Z", "2026-09-14", "2026-10-14", "14 sep – 14 okt 2026"],
    ["2026-10-13T12:00:00Z", "2026-08-14", "2026-09-14", "14 aug – 14 sep 2026"],
    // 13 okt 22:30 UTC is al 14 okt in Amsterdam
    ["2026-10-13T22:30:00Z", "2026-09-14", "2026-10-14", "14 sep – 14 okt 2026"],
    ["2027-01-20T10:00:00Z", "2026-12-14", "2027-01-14", "14 dec 2026 – 14 jan 2027"],
    ["2027-01-05T10:00:00Z", "2026-11-14", "2026-12-14", "14 nov – 14 dec 2026"],
  ])("%s → %s t/m %s", (date, start, eind, label) => {
    expect(periodForSubmission(new Date(date))).toEqual({ start, eind, label });
  });

  it("rekent in Amsterdamse tijd (zomer en winter)", () => {
    expect(amsterdamParts(new Date("2026-07-14T07:00:00Z")).hour).toBe(9);
    expect(amsterdamParts(new Date("2026-12-14T08:00:00Z")).hour).toBe(9);
  });
});
