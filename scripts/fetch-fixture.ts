// Slaat de echte API-respons van de testsheet op als tests/fixtures/sheet-14sept-14okt/raw.json.
// Gebruik: GOOGLE_API_KEY=... npx tsx scripts/fetch-fixture.ts
// Daarna gebruiken de tests raw.json in plaats van de compacte per-tab bestanden.
import fs from "node:fs";
import path from "node:path";
import { fetchSpreadsheet } from "../src/lib/sheets/fetch";

const ID = "1soGhXZ3cBCqEGMJPMp_Igr63bg8T75OAM6qiWPi8I0M";

async function main() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY ontbreekt");
  const data = await fetchSpreadsheet(ID, key);
  const out = path.join(__dirname, "..", "tests", "fixtures", "sheet-14sept-14okt", "raw.json");
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(`Opgeslagen: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
