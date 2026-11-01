import { createHmac, timingSafeEqual } from "node:crypto";
import type { IgFase } from "./core";

// Pure helpers voor Meta's Instagram-webhook (Instagram API with Instagram Login, velden messages en message_echoes).
// Geen database en geen netwerk; zie webhook-server.ts voor het wegschrijven.

/** GET-verificatie van Meta: geeft hub.challenge terug als mode en token kloppen, anders null. */
export function webhookChallenge(q: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  const mode = q.get("hub.mode");
  const token = q.get("hub.verify_token") ?? "";
  const challenge = q.get("hub.challenge");
  if (mode !== "subscribe" || challenge === null) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(ruwe body, App Secret), timing-safe vergeleken. Zonder geheim: altijd nee. */
export function handtekeningKlopt(raw: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const verwacht = Buffer.from(createHmac("sha256", appSecret).update(raw, "utf8").digest("hex"), "utf8");
  const gekregen = Buffer.from(header.slice(7).toLowerCase(), "utf8");
  return gekregen.length === verwacht.length && timingSafeEqual(gekregen, verwacht);
}

// ---------- Payload van Meta ----------

export interface MetaBijlage {
  type?: string;
  payload?: { url?: string } | null;
}
export interface MetaMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: MetaBijlage[];
    is_echo?: boolean;
    is_self?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    reply_to?: { mid?: string; story?: { url?: string; id?: string } };
  };
}
export interface MetaWebhook {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: MetaMessaging[] }[];
}

/** Eén bericht uit een webhook, al in de vorm van een ig_sync-bericht plus het account en de lead. */
export interface WebhookBericht {
  account_ig_id: string;
  lead_ig_id: string;
  bericht: {
    ig_message_id: string;
    van: "wij" | "lead";
    verzonden_op: string;
    tekst: string | null;
    extra: string[];
    links: string[];
    is_bookinglink: boolean;
    is_autoreply: boolean;
  };
}

// Zelfde herkenning als het sync-script op de box (collect.py / sync.py), zodat webhook en vangnet hetzelfde oordelen.
export const BOOKING_RE = /(calendly\.com|cal\.com|\/boek|booking|afspraak-?plannen|tidycal|zcal)/i;
export const URL_RE = /https?:\/\/\S+/gi;
export const AUTO_RE =
  /(bedankt voor (uw|je|jouw) (chat)?bericht|dank(je|jewel)? voor (je|uw) (chat)?bericht|zo snel mogelijk|zo spoedig mogelijk|binnen (2|twee) werkdagen|openingsuren|welkom bij)/i;
export const VIDEO_RE = /(loom\.com|beautyspecialist\.io\/video)/i;

const GEDEELD = new Set(["share", "ig_post", "ig_reel", "reel", "media"]);
const STORY = new Set(["story", "ig_story", "story_mention"]);

/** Tijdstempel van Meta (ms; voor de zekerheid ook seconden) naar ISO. */
export function metaTijd(ts: unknown): string | null {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
}

/**
 * Leest alle berichten uit een webhook. Richting: "wij" bij is_echo of als de afzender het eigen account is.
 * Overgeslagen: verwijderde berichten, berichten aan jezelf (is_self), en events zonder bericht (read, reactions).
 * `eigenId` is het eigen IG-account-id; zonder valt het terug op entry.id (volgens Meta het eigen account).
 */
export function leesWebhook(body: MetaWebhook, eigenId?: string | null): WebhookBericht[] {
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) return [];
  const uit: WebhookBericht[] = [];
  for (const entry of body.entry) {
    const eigen = eigenId || entry?.id;
    if (!eigen || !Array.isArray(entry?.messaging)) continue;
    for (const ev of entry.messaging) {
      const m = ev?.message;
      const afzender = ev?.sender?.id;
      const ontvanger = ev?.recipient?.id;
      if (!m || typeof m.mid !== "string" || !m.mid || m.is_deleted || m.is_self || !afzender || !ontvanger) continue;
      const wij: boolean = m.is_echo === true || afzender === eigen;
      const lead: string = wij ? ontvanger : afzender;
      if (lead === eigen) continue;
      const verzonden = metaTijd(ev.timestamp) ?? metaTijd(entry.time);
      if (!verzonden) continue;
      const tekst = typeof m.text === "string" && m.text ? m.text.slice(0, 20000) : null;
      const extra = new Set<string>();
      for (const b of Array.isArray(m.attachments) ? m.attachments : []) {
        const t = String(b?.type ?? "");
        extra.add(GEDEELD.has(t) ? "gedeelde post" : STORY.has(t) ? "story-reactie" : "bijlage");
      }
      if (m.reply_to?.story) extra.add("story-reactie");
      if (m.is_unsupported) extra.add("niet ondersteund");
      const links = wij && tekst ? (tekst.match(URL_RE) ?? []).slice(0, 50).map((l) => l.slice(0, 2000)) : [];
      uit.push({
        account_ig_id: eigen,
        lead_ig_id: lead,
        bericht: {
          ig_message_id: m.mid.slice(0, 200),
          van: wij ? "wij" : "lead",
          verzonden_op: verzonden,
          tekst,
          extra: [...extra],
          links,
          is_bookinglink: !!(wij && tekst && BOOKING_RE.test(tekst)),
          is_autoreply: !!(!wij && tekst && AUTO_RE.test(tekst)),
        },
      });
    }
  }
  return uit;
}

/** Fases die het script (en dus de webhook) zelf mag zetten. Call geboekt en geen interesse zijn voor brein of handmatig. */
export const SCRIPT_FASES: IgFase[] = ["opener_gestuurd", "in_gesprek", "video_gestuurd", "bookinglink_gestuurd"];

export interface FaseBericht {
  van: "wij" | "lead";
  verzonden_op: string;
  tekst: string | null;
  is_bookinglink: boolean;
  is_autoreply: boolean;
  autoreply_bevestigd?: boolean | null;
}

/** Zelfde regels als derive_fase in sync.py. Geeft de fase en het eerste bookinglink-moment. */
export function scriptFase(msgs: FaseBericht[]): { fase: IgFase | null; bookinglinkOp: string | null } {
  const t = (s: string) => new Date(s).getTime();
  const wij = msgs.filter((m) => m.van === "wij");
  const boek = wij.filter((m) => m.is_bookinglink).map((m) => t(m.verzonden_op));
  const video = wij.filter((m) => VIDEO_RE.test(m.tekst ?? "")).map((m) => t(m.verzonden_op));
  const lastBook = boek.length ? Math.max(...boek) : null;
  const lastVideo = video.length ? Math.max(...video) : null;
  const bookinglinkOp = boek.length ? new Date(Math.min(...boek)).toISOString() : null;
  const echteLead = msgs.some((m) => m.van === "lead" && !(m.autoreply_bevestigd ?? m.is_autoreply));
  if (lastVideo !== null && (lastBook === null || lastBook < lastVideo)) return { fase: "video_gestuurd", bookinglinkOp };
  if (lastBook !== null) return { fase: "bookinglink_gestuurd", bookinglinkOp };
  if (echteLead) return { fase: "in_gesprek", bookinglinkOp };
  if (wij.length) return { fase: "opener_gestuurd", bookinglinkOp };
  return { fase: null, bookinglinkOp };
}

/** Tijdelijk gesprek-id voor een gesprek dat de webhook eerder zag dan de sync; de sync neemt het over. */
export const voorlopigGesprekId = (leadIgId: string) => `igsid:${leadIgId}`;
