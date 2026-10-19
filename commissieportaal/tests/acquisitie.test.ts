import { describe, expect, it } from "vitest";
import { acqPeriodFor, periodsFor } from "@/lib/acquisitie/period";

describe("acquisitie: periodes", () => {
  it.each([
    ["2026-10-12T08:00:00Z", "2026-10-12", "2026-11-14"],
    ["2026-11-13T22:00:00Z", "2026-10-12", "2026-11-14"],
    ["2026-11-14T08:00:00Z", "2026-11-14", "2026-12-14"],
    ["2026-12-20T08:00:00Z", "2026-12-14", "2027-01-14"],
    ["2027-01-05T08:00:00Z", "2026-12-14", "2027-01-14"],
  ])("%s → %s – %s", (d, start, eind) => {
    expect(acqPeriodFor(new Date(d))).toMatchObject({ start, eind });
  });
});

describe("acquisitie: periodelijst", () => {
  it("nieuwste eerst, terug tot de afwijkende eerste periode", () => {
    expect(periodsFor({ start_datum: "2026-10-12" }, new Date("2027-01-20T10:00:00Z")).map((p) => `${p.start}/${p.eind}`)).toEqual([
      "2027-01-14/2027-02-14",
      "2026-12-14/2027-01-14",
      "2026-11-14/2026-12-14",
      "2026-10-12/2026-11-14",
    ]);
    expect(periodsFor({ start_datum: "2026-10-12" }, new Date("2026-10-17T10:00:00Z")).map((p) => p.start)).toEqual(["2026-10-12"]);
  });
});
