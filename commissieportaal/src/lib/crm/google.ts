import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { db } from "../supabase/server";

/**
 * Google Agenda per setter (OAuth). Terugbelmomenten en taken uit het CRM komen als afspraak met herinnering
 * in de eigen agenda; wijzigt of vervalt het moment, dan wordt de afspraak bijgewerkt of verwijderd.
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Redirect-URI: <APP_URL>/api/google/callback.
 */
const e = (k: string) => process.env[k]?.trim() || null;
export const googleAan = () => !!(e("GOOGLE_CLIENT_ID") && e("GOOGLE_CLIENT_SECRET"));
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
const basis = () => env("APP_URL").replace(/\/$/, "");
const redirectUri = () => `${basis()}/api/google/callback`;

// ---------- Versleutelde opslag van het refresh-token ----------
const sleutel = () => createHash("sha256").update(`${env("ADMIN_SESSION_SECRET")}:google`).digest();
function versleutel(tekst: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sleutel(), iv);
  const data = Buffer.concat([c.update(tekst, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
function ontsleutel(waarde: string) {
  const [iv, tag, data] = waarde.split(".").map((x) => Buffer.from(x, "base64url"));
  const d = createDecipheriv("aes-256-gcm", sleutel(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

// ---------- Ondertekende state (wie koppelt, max. 15 minuten geldig) ----------
const teken = (s: string) => createHmac("sha256", `${env("ADMIN_SESSION_SECRET")}:google-state`).update(s).digest("base64url");
export function maakState(setterId: string) {
  const s = `${setterId}.${Date.now()}`;
  return `${s}.${teken(s)}`;
}
export function leesState(state: string | null): string | null {
  const [id, ts, sig] = (state ?? "").split(".");
  if (!id || !ts || !sig) return null;
  const goed = Buffer.from(teken(`${id}.${ts}`));
  const echt = Buffer.from(sig);
  if (goed.length !== echt.length || !timingSafeEqual(goed, echt)) return null;
  if (Date.now() - Number(ts) > 15 * 60000) return null;
  return id;
}

export function autorisatieUrl(setterId: string, email: string) {
  const p = new URLSearchParams({
    client_id: e("GOOGLE_CLIENT_ID")!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: email,
    state: maakState(setterId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function token(body: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e("GOOGLE_CLIENT_ID")!, client_secret: e("GOOGLE_CLIENT_SECRET")!, ...body }),
    cache: "no-store",
  });
  const d = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string };
  if (!r.ok || !d.access_token) throw new Error(`Google token: ${d.error ?? r.status}`);
  return d;
}

/** Na toestemming bij Google: code inwisselen en de koppeling opslaan. */
export async function rondKoppelingAf(setterId: string, code: string) {
  const d = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!d.refresh_token) throw new Error("Google gaf geen refresh-token terug. Probeer opnieuw te koppelen.");
  if (!d.scope?.includes("calendar.events")) throw new Error("Geen toestemming voor de agenda gegeven. Vink de agenda aan bij het koppelen.");
  let googleEmail: string | null = null;
  try {
    googleEmail = (JSON.parse(Buffer.from(d.id_token!.split(".")[1], "base64url").toString()) as { email?: string }).email ?? null;
  } catch {
    /* e-mail is alleen ter info */
  }
  const { error } = await db().from("crm_google_koppelingen").upsert({ setter_id: setterId, google_email: googleEmail, refresh_token_enc: versleutel(d.refresh_token), gekoppeld_op: new Date().toISOString(), laatste_fout: null, laatste_fout_op: null });
  if (error) throw new Error(error.message);
}

export async function ontkoppel(setterId: string) {
  const k = await koppeling(setterId);
  if (k) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(ontsleutel(k.refresh_token_enc))}`, { method: "POST" }).catch(() => null);
    await db().from("crm_google_koppelingen").delete().eq("setter_id", setterId);
  }
}

type Koppeling = { setter_id: string; google_email: string | null; refresh_token_enc: string; gekoppeld_op: string; laatste_fout: string | null };
export async function koppeling(setterId: string): Promise<Koppeling | null> {
  const { data } = await db().from("crm_google_koppelingen").select("setter_id, google_email, refresh_token_enc, gekoppeld_op, laatste_fout").eq("setter_id", setterId).maybeSingle();
  return (data as Koppeling | null) ?? null;
}

export async function koppelingen(): Promise<Map<string, { email: string | null; fout: string | null }>> {
  const { data } = await db().from("crm_google_koppelingen").select("setter_id, google_email, laatste_fout");
  return new Map(((data ?? []) as { setter_id: string; google_email: string | null; laatste_fout: string | null }[]).map((k) => [k.setter_id, { email: k.google_email, fout: k.laatste_fout }]));
}

async function fout(setterId: string, tekst: string) {
  await db().from("crm_google_koppelingen").update({ laatste_fout: tekst.slice(0, 300), laatste_fout_op: new Date().toISOString() }).eq("setter_id", setterId);
}

async function accessToken(setterId: string): Promise<string | null> {
  if (!googleAan()) return null;
  const k = await koppeling(setterId);
  if (!k) return null;
  try {
    return (await token({ grant_type: "refresh_token", refresh_token: ontsleutel(k.refresh_token_enc) })).access_token!;
  } catch (x) {
    await fout(setterId, x instanceof Error && /invalid_grant/.test(x.message) ? "Koppeling verlopen: koppel Google Agenda opnieuw." : String(x));
    return null;
  }
}

// ---------- Afspraken ----------
interface Afspraak {
  titel: string;
  beschrijving: string;
  start: string;
  minuten: number;
}

async function api(tok: string, pad: string, method: string, body?: unknown) {
  return fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${pad}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

async function zetAfspraak(setterId: string, eventId: string | null, a: Afspraak): Promise<string | null> {
  const tok = await accessToken(setterId);
  if (!tok) return null;
  const start = new Date(a.start);
  const body = {
    summary: a.titel,
    description: a.beschrijving,
    start: { dateTime: start.toISOString(), timeZone: "Europe/Amsterdam" },
    end: { dateTime: new Date(start.getTime() + a.minuten * 60000).toISOString(), timeZone: "Europe/Amsterdam" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }, { method: "popup", minutes: 0 }] },
    source: { title: "Gewoon Sales Doen", url: basis() + "/crm" },
    extendedProperties: { private: { gdm: "1" } },
  };
  if (Number.isNaN(start.getTime())) throw new Error(`Ongeldig tijdstip: ${a.start}`);
  let r = eventId ? await api(tok, `/${encodeURIComponent(eventId)}`, "PATCH", body) : null;
  if (!r || r.status === 404 || r.status === 410) r = await api(tok, "", "POST", body);
  if (!r.ok) {
    await fout(setterId, `Agenda: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return eventId;
  }
  return ((await r.json()) as { id: string }).id;
}

async function verwijderAfspraak(setterId: string | null, eventId: string | null) {
  if (!setterId || !eventId) return;
  const tok = await accessToken(setterId);
  if (tok) await api(tok, `/${encodeURIComponent(eventId)}`, "DELETE").catch(() => null);
}

const leadLink = (id: string) => `${basis()}/crm/lead/${id}`;

/** Terugbel-/opvolgmoment van een lead naar de agenda van de eigenaar (setter). Fouten blokkeren het CRM nooit. */
export async function syncOpvolging(contactId: string) {
  try {
    if (!googleAan()) return;
    const { data, error } = await db().from("crm_contacts").select("id, salon_naam, contactpersoon, telefoon_norm, volgende_opvolging_op, eigenaar_id, niet_benaderen, google_event_id, google_event_setter").eq("id", contactId).maybeSingle();
    if (error) throw new Error(error.message);
    const c = data as { id: string; salon_naam: string; contactpersoon: string | null; telefoon_norm: string | null; volgende_opvolging_op: string | null; eigenaar_id: string | null; niet_benaderen: boolean; google_event_id: string | null; google_event_setter: string | null } | null;
    if (!c) return;
    const doel = c.volgende_opvolging_op && !c.niet_benaderen ? c.eigenaar_id : null;
    if (c.google_event_id && c.google_event_setter && c.google_event_setter !== doel) {
      await verwijderAfspraak(c.google_event_setter, c.google_event_id);
      await db().from("crm_contacts").update({ google_event_id: null, google_event_setter: null }).eq("id", c.id);
      c.google_event_id = null;
    }
    if (!doel || !c.volgende_opvolging_op) return;
    const id = await zetAfspraak(doel, c.google_event_id, {
      titel: `📞 Terugbellen: ${c.salon_naam}`,
      beschrijving: [c.contactpersoon && `Contact: ${c.contactpersoon}`, c.telefoon_norm && `Telefoon: ${c.telefoon_norm}`, `Leadkaart: ${leadLink(c.id)}`].filter(Boolean).join("\n"),
      start: c.volgende_opvolging_op,
      minuten: 15,
    });
    if (id && id !== c.google_event_id) await db().from("crm_contacts").update({ google_event_id: id, google_event_setter: doel }).eq("id", c.id);
  } catch (x) {
    console.error("Google Agenda (opvolging) mislukt", x);
  }
}

/** Taak met datum naar de agenda van wie de taak heeft; afgerond = afspraak weg. */
export async function syncTaak(taskId: string) {
  try {
    if (!googleAan()) return;
    const { data, error } = await db().from("crm_tasks").select("id, titel, vervalt_op, gedaan_op, toegewezen_aan, contact_id, google_event_id, google_event_setter, contact:crm_contacts(salon_naam, telefoon_norm)").eq("id", taskId).maybeSingle();
    if (error) throw new Error(error.message);
    const t = data as unknown as { id: string; titel: string; vervalt_op: string | null; gedaan_op: string | null; toegewezen_aan: string | null; contact_id: string; google_event_id: string | null; google_event_setter: string | null; contact: { salon_naam: string; telefoon_norm: string | null } | null } | null;
    if (!t) return;
    const doel = t.vervalt_op && !t.gedaan_op ? t.toegewezen_aan : null;
    if (t.google_event_id && t.google_event_setter && t.google_event_setter !== doel) {
      await verwijderAfspraak(t.google_event_setter, t.google_event_id);
      await db().from("crm_tasks").update({ google_event_id: null, google_event_setter: null }).eq("id", t.id);
      t.google_event_id = null;
    }
    if (!doel || !t.vervalt_op) return;
    const id = await zetAfspraak(doel, t.google_event_id, {
      titel: `✅ ${t.titel}${t.contact ? ` · ${t.contact.salon_naam}` : ""}`,
      beschrijving: [t.contact?.telefoon_norm && `Telefoon: ${t.contact.telefoon_norm}`, `Leadkaart: ${leadLink(t.contact_id)}`].filter(Boolean).join("\n"),
      start: t.vervalt_op,
      minuten: 15,
    });
    if (id && id !== t.google_event_id) await db().from("crm_tasks").update({ google_event_id: id, google_event_setter: doel }).eq("id", t.id);
  } catch (x) {
    console.error("Google Agenda (taak) mislukt", x);
  }
}

/**
 * Vangnet (cron en na koppelen): alles wat in de toekomst ligt maar nog geen agenda-afspraak heeft, alsnog zetten.
 * Zo mist een setter geen herinnering als een directe synchronisatie ooit niet doorkwam.
 */
export async function synchroniseerOpenstaand(setterId?: string) {
  if (!googleAan()) return { leads: 0, taken: 0 };
  const nu = new Date().toISOString();
  const gekoppeld = setterId ? [setterId] : [...(await koppelingen()).keys()];
  if (!gekoppeld.length) return { leads: 0, taken: 0 };
  const [{ data: leads }, { data: taken }] = await Promise.all([
    db().from("crm_contacts").select("id").in("eigenaar_id", gekoppeld).eq("niet_benaderen", false).gt("volgende_opvolging_op", nu).is("google_event_id", null).limit(200),
    db().from("crm_tasks").select("id").in("toegewezen_aan", gekoppeld).is("gedaan_op", null).gt("vervalt_op", nu).is("google_event_id", null).limit(200),
  ]);
  for (const l of (leads ?? []) as { id: string }[]) await syncOpvolging(l.id);
  for (const t of (taken ?? []) as { id: string }[]) await syncTaak(t.id);
  return { leads: leads?.length ?? 0, taken: taken?.length ?? 0 };
}

export interface GoogleEvent {
  id: string;
  titel: string;
  start: string;
  heleDag: boolean;
  link: string | null;
}

/** Eigen afspraken uit Google Agenda (niet die het CRM zelf plaatste), om live in de CRM-agenda te tonen. */
export async function googleAgenda(setterId: string, van: string, tot: string): Promise<{ items: GoogleEvent[]; fout: string | null }> {
  if (!googleAan()) return { items: [], fout: null };
  const tok = await accessToken(setterId);
  if (!tok) return { items: [], fout: "Geen geldige Google-koppeling." };
  const q = new URLSearchParams({ timeMin: van, timeMax: tot, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return { items: [], fout: `Google Agenda niet bereikbaar (${r?.status ?? "netwerk"}).` };
  const d = (await r.json()) as { items?: { id: string; status?: string; summary?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; source?: { title?: string }; extendedProperties?: { private?: Record<string, string> } }[] };
  return {
    fout: null,
    items: (d.items ?? [])
      .filter((x) => x.status !== "cancelled" && x.extendedProperties?.private?.gdm !== "1" && x.source?.title !== "Gewoon Sales Doen")
      .map((x) => ({ id: x.id, titel: x.summary || "(geen titel)", start: x.start?.dateTime ?? `${x.start?.date}T00:00:00`, heleDag: !x.start?.dateTime, link: x.htmlLink ?? null })),
  };
}
