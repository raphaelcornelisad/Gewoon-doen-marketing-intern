import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Bronvermelding van de videopagina's op de beauty-site (/video en /video-2).
 * Puur: validatie, CORS, rate limit en labels. Geen database (zie ./server).
 */

export const VIDEO_EVENTS = ["view", "play", "calendly_view", "booked"] as const;
export const VIDEO_PAGES = ["video", "video-2"] as const;
export type VideoEvent = (typeof VIDEO_EVENTS)[number];
export type VideoPage = (typeof VIDEO_PAGES)[number];

/** Maximale grootte van een body; een echte event is een paar honderd bytes. */
export const MAX_BODY = 4096;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,40}$/, "bron: alleen a-z, 0-9, _ en -, maximaal 40 tekens");

const calendlyUri = z
  .string()
  .max(300)
  .regex(/^https:\/\/api\.calendly\.com\/[A-Za-z0-9/_-]+$/, "geen Calendly-URI");

const utm = z
  .record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.string().max(100))
  .refine((o) => Object.keys(o).length <= 12, "te veel utm-velden");

export const videoEventSchema = z.object({
  event: z.enum(VIDEO_EVENTS),
  page: z.enum(VIDEO_PAGES),
  source: slug,
  visitor_id: z.uuid(),
  utm: utm.optional().default({}),
  referrer: z.string().max(1000).nullish(),
  calendly_event_uri: calendlyUri.nullish(),
  calendly_invitee_uri: calendlyUri.nullish(),
});
export type VideoEventInput = z.infer<typeof videoEventSchema>;

/** Rij voor video_events. Calendly-URI's alleen bij een boeking; verwijzer zonder querystring. */
export function videoRow(input: VideoEventInput, userAgent: string | null) {
  return {
    event: input.event,
    page: input.page,
    source: input.source,
    visitor_id: input.visitor_id,
    utm: input.utm,
    referrer: schoneVerwijzer(input.referrer),
    user_agent_hash: userAgent ? createHash("sha256").update(userAgent).digest("hex") : null,
    calendly_event_uri: input.event === "booked" ? (input.calendly_event_uri ?? null) : null,
    calendly_invitee_uri: input.event === "booked" ? (input.calendly_invitee_uri ?? null) : null,
  };
}

/** Alleen origin + pad (een querystring kan persoonsgegevens bevatten). Ongeldig of leeg wordt null. */
export function schoneVerwijzer(r: string | null | undefined): string | null {
  if (!r) return null;
  try {
    const u = new URL(r);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

/** Leest een body als JSON, ongeacht content-type (sendBeacon stuurt text/plain). */
export function leesBody(raw: string): { ok: true; data: VideoEventInput } | { ok: false; fout: string } {
  if (raw.length > MAX_BODY) return { ok: false, fout: "te groot" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, fout: "geen JSON" };
  }
  const r = videoEventSchema.safeParse(json);
  return r.success ? { ok: true, data: r.data } : { ok: false, fout: r.error.issues[0]?.message ?? "ongeldig" };
}

// ---------- CORS ----------

const VASTE_ORIGINS = new Set(["https://beautyspecialist.io", "https://www.beautyspecialist.io", "https://beauty-staging.vercel.app"]);
const PREVIEW = /^https:\/\/beauty-specialist-[a-z0-9-]+\.vercel\.app$/;

export function originToegestaan(origin: string | null): origin is string {
  return !!origin && (VASTE_ORIGINS.has(origin) || PREVIEW.test(origin));
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

// ---------- Rate limit ----------

/**
 * Eenvoudige rate limit per IP in het geheugen van de functie-instantie (vast venster).
 * Het IP wordt alleen als hash als sleutel gebruikt en nooit opgeslagen.
 */
export function maakRateLimit(max: number, vensterMs: number) {
  const tellers = new Map<string, { start: number; n: number }>();
  return (ip: string, nu = Date.now()): boolean => {
    const k = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const t = tellers.get(k);
    if (!t || nu - t.start >= vensterMs) {
      if (tellers.size > 5000) for (const [key, v] of tellers) if (nu - v.start >= vensterMs) tellers.delete(key);
      tellers.set(k, { start: nu, n: 1 });
      return true;
    }
    t.n += 1;
    return t.n <= max;
  };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "onbekend";
}

// ---------- Labels en tellingen ----------

const LABELS: Record<string, string> = {
  raphael: "Raphael",
  setter: "Setter",
  larissa_whatsapp: "Larissa (WhatsApp)",
  organisch: "Organisch",
};
export const bronLabel = (source: string) => LABELS[source] ?? source;
export const paginaLabel = (page: string) => `/${page}`;

export interface BronRij {
  source: string | null;
  page: string | null;
  bezoekers: number;
  plays: number;
  calendly_views: number;
  boekingen: number;
}

/** Conversie bezoeker naar boeking in procenten (één decimaal), of null zonder bezoekers. */
export const conversie = (r: Pick<BronRij, "bezoekers" | "boekingen">): number | null => (r.bezoekers ? Math.round((r.boekingen / r.bezoekers) * 1000) / 10 : null);

export type Periode = "vandaag" | "7d" | "30d";
export const PERIODES: { key: Periode; label: string }[] = [
  { key: "vandaag", label: "Vandaag" },
  { key: "7d", label: "7 dagen" },
  { key: "30d", label: "30 dagen" },
];
export const isPeriode = (p: unknown): p is Periode => PERIODES.some((x) => x.key === p);

/** Begin van de periode: vandaag vanaf 00:00 Amsterdam, anders 7 of 30 x 24 uur terug. */
export function periodeVan(p: Periode, nu: Date, amsterdamMidnight: (datum: string) => string): string {
  if (p === "vandaag") return amsterdamMidnight(nu.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }));
  return new Date(nu.getTime() - (p === "7d" ? 7 : 30) * 86400000).toISOString();
}
