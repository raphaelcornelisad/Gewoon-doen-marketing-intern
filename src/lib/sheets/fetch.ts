import type { ApiSpreadsheet } from "./types";

export const SHEETS_FIELDS =
  "properties.title,sheets.properties.title,sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)";

export const NOT_PUBLIC_MESSAGE =
  "We kunnen je sheet niet openen. Zet hem op openbaar: Delen → Algemene toegang → Iedereen met de link → Lezer. Probeer het daarna opnieuw.";

export class SheetFetchError extends Error {
  constructor(
    message: string,
    public readonly code: "niet_openbaar" | "niet_gevonden" | "onbekend",
  ) {
    super(message);
  }
}

export async function fetchSpreadsheet(id: string, apiKey: string): Promise<ApiSpreadsheet> {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`);
  url.searchParams.set("includeGridData", "true");
  url.searchParams.set("fields", SHEETS_FIELDS);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { cache: "no-store" });
  if (res.ok) return (await res.json()) as ApiSpreadsheet;

  if (res.status === 403 || res.status === 401) throw new SheetFetchError(NOT_PUBLIC_MESSAGE, "niet_openbaar");
  if (res.status === 404) {
    throw new SheetFetchError("Deze sheet bestaat niet. Controleer de link.", "niet_gevonden");
  }
  throw new SheetFetchError(
    `Google Sheets gaf een fout (${res.status}). Probeer het later opnieuw.`,
    "onbekend",
  );
}
