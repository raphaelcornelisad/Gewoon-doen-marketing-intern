/** Alle fases van een Instagram-gesprek (check-constraint op ig_threads.fase). */
export const IG_FASES = [
  { key: "opener_gestuurd", label: "Opener gestuurd" },
  { key: "in_gesprek", label: "In gesprek" },
  { key: "video_gestuurd", label: "Video gestuurd" },
  { key: "bookinglink_gestuurd", label: "Bookinglink gestuurd" },
  { key: "call_geboekt", label: "Call geboekt" },
  { key: "geen_interesse", label: "Geen interesse" },
  { key: "niet_bruikbaar", label: "Niet bruikbaar" },
  { key: "intern", label: "Intern" },
  { key: "spam", label: "Spam" },
] as const;

export type IgFase = (typeof IG_FASES)[number]["key"];
export const FASE_KEYS = IG_FASES.map((f) => f.key) as [IgFase, ...IgFase[]];

/** Kolommen op het bord: zonder intern en spam (die tellen niet mee). */
export const IG_PIJPLIJN = IG_FASES.filter((f) => f.key !== "intern" && f.key !== "spam");

export const isIgFase = (f: unknown): f is IgFase => typeof f === "string" && (FASE_KEYS as string[]).includes(f);
export const igFaseLabel = (f: string) => IG_FASES.find((x) => x.key === f)?.label ?? f;

/** Norm: een echt leadbericht moet binnen 30 minuten een antwoord hebben. */
export const WACHT_NORM_MIN = 30;

/** Een leadbericht ouder dan dit telt niet meer als "wacht op ons" maar als "blijven liggen" (Seyed 5887/5888). */
export const WACHT_VENSTER_DAGEN = 7;

const minutenSinds = (sinds: string, nu: Date) => Math.floor((nu.getTime() - new Date(sinds).getTime()) / 60000);

/** Minuten dat de lead al wacht, alleen tussen de norm en het venster van 7 dagen; anders null. */
export function wachtMinuten(sinds: string | null | undefined, nu: Date = new Date()): number | null {
  if (!sinds) return null;
  const min = minutenSinds(sinds, nu);
  return min > WACHT_NORM_MIN && min <= WACHT_VENSTER_DAGEN * 1440 ? min : null;
}

/** Leadbericht dat langer dan het venster onbeantwoord is gebleven. */
export function blijvenLiggen(sinds: string | null | undefined, nu: Date = new Date()): boolean {
  return !!sinds && minutenSinds(sinds, nu) > WACHT_VENSTER_DAGEN * 1440;
}

/** "45 min", "3 u 10 min", "2 d 4 u". */
export function duurTekst(min: number): string {
  if (min < 60) return `${min} min`;
  const u = Math.floor(min / 60);
  if (u < 24) return `${u} u${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.floor(u / 24)} d${u % 24 ? ` ${u % 24} u` : ""}`;
}

/** Eerste 90 tekens van het laatste bericht, op één regel. */
export function kortBericht(tekst: string | null | undefined, max = 90): string {
  const t = (tekst ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Link die het DM-gesprek met deze gebruiker in Instagram opent. */
export function instagramLink(gebruikersnaam: string | null | undefined): string {
  const u = (gebruikersnaam ?? "").replace(/^@/, "").trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(u) ? `https://ig.me/m/${u}` : "https://www.instagram.com/direct/inbox/";
}

/** Dagcijfers in de hoofdtegels (naast "Wacht nu op ons", live); de rest staat onder "Meer cijfers". */
export const IG_HOOFDTEGELS = ["nieuwe_gesprekken", "echte_reactie_lead", "calls_bevestigd"];

/** Tegels bovenaan het bord, in de volgorde van het dagrapport. */
export const IG_TEGELS: { key: string; label: string; pct?: boolean }[] = [
  { key: "nieuwe_gesprekken", label: "Nieuwe gesprekken" },
  { key: "nieuw_door_ons", label: "Nieuw door ons" },
  { key: "nieuw_door_lead", label: "Nieuw door lead" },
  { key: "lopende_gesprekken", label: "Lopende gesprekken" },
  { key: "echte_reactie_lead", label: "Echte reactie lead" },
  { key: "alleen_autoreply", label: "Alleen autoreply" },
  { key: "geen_reactie", label: "Geen reactie" },
  { key: "reactie_openers_pct", label: "Reactie op openers", pct: true },
  { key: "signaal_sterk", label: "Koop-/callsignaal sterk" },
  { key: "signaal_lauw", label: "Koop-/callsignaal lauw" },
  { key: "geen_interesse", label: "Geen interesse" },
  { key: "bookinglinks", label: "Bookinglinks gestuurd" },
  { key: "calls_bevestigd", label: "Calls bevestigd" },
  { key: "te_laat_30min", label: "Te laat (> 30 min)" },
  { key: "wacht_nu_op_ons", label: "Wacht nu op ons" },
  { key: "calendly_nieuw_alle_bronnen", label: "Calendly nieuw (alle bronnen)" },
];

/** Waarde voor een tegel; null betekent dat het cijfer nog niet beoordeeld is. */
export function tegelWaarde(v: number | string | null | undefined, pct = false): string {
  if (v === null || v === undefined) return "nog niet beoordeeld";
  const n = Number(v);
  return pct ? `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%` : String(n);
}
