import { describe, expect, it } from "vitest";
import { extractSpreadsheetId } from "@/lib/sheets/parse-url";

const ID = "1soGhXZ3cBCqEGMJPMp_Igr63bg8T75OAM6qiWPi8I0M";

describe("spreadsheet-ID uit link", () => {
  it.each([
    `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`,
    `docs.google.com/spreadsheets/d/${ID}`,
    `  ${ID} `,
  ])("%s", (url) => {
    expect(extractSpreadsheetId(url)).toBe(ID);
  });

  it("weigert andere links", () => {
    expect(extractSpreadsheetId("https://example.com")).toBeNull();
  });
});
