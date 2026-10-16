import fs from "node:fs";
import path from "node:path";
import type { ApiCell, ApiSpreadsheet } from "@/lib/sheets/types";

/**
 * Laadt de testsheet "14 sept - 14 okt" (1soGhXZ3cBCqEGMJPMp_Igr63bg8T75OAM6qiWPi8I0M).
 *
 * Als raw.json bestaat (echte API-respons, zie scripts/fetch-fixture.ts) wordt die gebruikt.
 * Anders wordt de API-respons opgebouwd uit de compacte per-tab bestanden NN.json:
 *   { title, rows: [[hexKolomA | null, waardeA, waardeB, ...], ...] }
 * Alleen de achtergrondkleur van kolom A is opgenomen; meer gebruikt de parser niet.
 */
const DIR = path.join(__dirname, "..", "fixtures", "sheet-14sept-14okt");

const hexToColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};

export function loadTestSpreadsheet(): ApiSpreadsheet {
  const raw = path.join(DIR, "raw.json");
  if (fs.existsSync(raw)) return JSON.parse(fs.readFileSync(raw, "utf8"));

  const files = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).sort();
  return {
    properties: { title: "14 sept - 14 okt " },
    sheets: files.map((f) => {
      const tab = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as {
        title: string;
        rows: (string | null)[][];
      };
      return {
        properties: { title: tab.title },
        data: [
          {
            rowData: tab.rows.map(([hex, ...values]) => ({
              values: values.map((v, i): ApiCell => {
                const cell: ApiCell = {};
                if (v) cell.formattedValue = v;
                if (i === 0 && hex) cell.effectiveFormat = { backgroundColor: hexToColor(hex) };
                return cell;
              }),
            })),
          },
        ],
      };
    }),
  };
}
