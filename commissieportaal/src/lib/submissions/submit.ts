import { calculateCommission, type Commission } from "../commission";
import { periodForSubmission, type PeriodRange } from "../period";
import type { AppSettings } from "../settings";
import { SheetFetchError } from "../sheets/fetch";
import { extractSpreadsheetId } from "../sheets/parse-url";
import { parseSpreadsheet } from "../sheets/parser";
import type { ApiSpreadsheet, Counts, ParseResult } from "../sheets/types";

export interface SubmitInput {
  naam: string;
  email: string;
  sheetUrl: string;
}

export type SubmitErrorCode =
  | "ongeldig"
  | "niet_openbaar"
  | "niet_gevonden"
  | "geen_leads"
  | "al_goedgekeurd"
  | "onbekend";

/** Alles wat nodig is voor de controlemail aan de admin. */
export interface SubmittedDetails {
  setterNaam: string;
  setterEmail: string;
  periode: PeriodRange;
  sheetUrl: string;
  parsed: ParseResult;
  commission: Commission;
}

export type SubmitResult =
  | {
      ok: true;
      submissionId: string;
      vervangen: boolean;
      nieuweSetter: boolean;
      details: SubmittedDetails;
    }
  | { ok: false; code: SubmitErrorCode; message: string; field?: keyof SubmitInput };

export interface CountsJson {
  totaal: Counts;
  perTab: Record<string, Counts>;
}

export interface NewSubmission {
  setterId: string;
  periodId: string;
  sheetUrl: string;
  sheetId: string;
  sheetTitle: string;
  snapshot: ParseResult;
  counts: CountsJson;
  commission: Commission;
  settings: AppSettings;
}

export interface SubmissionStore {
  getSettings(): Promise<AppSettings>;
  findSetterByEmail(email: string): Promise<{ id: string } | null>;
  createSetter(naam: string, email: string): Promise<{ id: string }>;
  ensurePeriod(p: PeriodRange): Promise<{ id: string }>;
  /** Status van de actieve indiening voor deze setter en periode, of null. */
  activeSubmissionStatus(setterId: string, periodId: string): Promise<string | null>;
  /** Opkomst (aantal verschenen) van de periode die eindigt op `start`, nog niet uitbetaald. */
  confirmedAttendance(setterId: string, start: string): Promise<number>;
  save(s: NewSubmission): Promise<{ result: "nieuw" | "vervangen" | "geblokkeerd"; id: string }>;
}

export interface SubmitDeps {
  store: SubmissionStore;
  fetchSheet: (id: string) => Promise<ApiSpreadsheet>;
  now?: () => Date;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ALREADY_APPROVED_MESSAGE =
  "Je lijst voor deze periode is al goedgekeurd en kan niet opnieuw worden ingediend. Klopt er iets niet? Neem dan contact met ons op.";

export function validateInput(input: SubmitInput): SubmitResult | null {
  if (input.naam.trim().length < 2) {
    return { ok: false, code: "ongeldig", field: "naam", message: "Vul je naam in." };
  }
  if (!EMAIL.test(input.email.trim())) {
    return { ok: false, code: "ongeldig", field: "email", message: "Vul een geldig e-mailadres in." };
  }
  if (!extractSpreadsheetId(input.sheetUrl)) {
    return {
      ok: false,
      code: "ongeldig",
      field: "sheetUrl",
      message: "Dit is geen geldige Google Sheets-link. Kopieer de link uit de adresbalk van je sheet.",
    };
  }
  return null;
}

export function countsJson(parsed: ParseResult): CountsJson {
  return {
    totaal: parsed.totaal,
    perTab: Object.fromEntries(parsed.tabs.filter((t) => !t.overgeslagen).map((t) => [t.tab, t.counts])),
  };
}

export async function submitSheet(input: SubmitInput, deps: SubmitDeps): Promise<SubmitResult> {
  const invalid = validateInput(input);
  if (invalid) return invalid;

  const naam = input.naam.trim();
  const email = input.email.trim().toLowerCase();
  const sheetUrl = input.sheetUrl.trim();
  const sheetId = extractSpreadsheetId(sheetUrl)!;
  const { store } = deps;

  const periode = periodForSubmission(deps.now?.() ?? new Date());
  const period = await store.ensurePeriod(periode);

  // Vroeg blokkeren als deze periode al is goedgekeurd: dan hoeven we de sheet niet te lezen.
  const bestaand = await store.findSetterByEmail(email);
  if (bestaand && (await store.activeSubmissionStatus(bestaand.id, period.id)) === "goedgekeurd") {
    return { ok: false, code: "al_goedgekeurd", message: ALREADY_APPROVED_MESSAGE };
  }

  let data: ApiSpreadsheet;
  try {
    data = await deps.fetchSheet(sheetId);
  } catch (e) {
    if (e instanceof SheetFetchError) {
      const code = e.code === "onbekend" ? "onbekend" : e.code;
      return { ok: false, code, field: "sheetUrl", message: e.message };
    }
    throw e;
  }

  const settings = await store.getSettings();
  const parsed = parseSpreadsheet(data, settings.parser);
  if (parsed.tabs.every((t) => t.overgeslagen)) {
    return {
      ok: false,
      code: "geen_leads",
      field: "sheetUrl",
      message: 'We vonden geen leads in deze sheet. Controleer of elk tabblad een kolom "Naam Lead" heeft.',
    };
  }

  const setter = bestaand ?? (await store.createSetter(naam, email));
  const opkomst = await store.confirmedAttendance(setter.id, periode.start);
  const commission = calculateCommission(parsed.totaal, settings.commissie, opkomst);

  const saved = await store.save({
    setterId: setter.id,
    periodId: period.id,
    sheetUrl,
    sheetId,
    sheetTitle: parsed.titel,
    snapshot: parsed,
    counts: countsJson(parsed),
    commission,
    settings,
  });

  if (saved.result === "geblokkeerd") {
    return { ok: false, code: "al_goedgekeurd", message: ALREADY_APPROVED_MESSAGE };
  }
  return {
    ok: true,
    submissionId: saved.id,
    vervangen: saved.result === "vervangen",
    nieuweSetter: !bestaand,
    details: { setterNaam: naam, setterEmail: email, periode, sheetUrl, parsed, commission },
  };
}
