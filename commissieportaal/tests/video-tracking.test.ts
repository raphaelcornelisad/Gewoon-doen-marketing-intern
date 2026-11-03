import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, testDatabase } from "./helpers/pglite-db";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ db: () => h.db }));

import { OPTIONS, POST } from "@/app/api/track/video/route";
import { amsterdamMidnight } from "@/lib/crm/server";
import { videoBronnen } from "@/lib/video/server";
import { bronLabel, conversie, leesBody, maakRateLimit, originToegestaan, periodeVan, schoneVerwijzer, videoRow, type BronRij } from "@/lib/video/track";

// Alles verzonnen: willekeurige uuid's en nep-URI's, geen echte bezoekers of boekingen.
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const V3 = "33333333-3333-4333-8333-333333333333";
const EV = "https://api.calendly.com/scheduled_events/VERZONNEN1";
const INV = "https://api.calendly.com/scheduled_events/VERZONNEN1/invitees/VERZONNEN2";
const ORIGIN = "https://beautyspecialist.io";

const geldig = { event: "view", page: "video", source: "raphael", visitor_id: V1, utm: { utm_source: "ig" }, referrer: "https://l.instagram.com/?u=x" };

let pg: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await pg.query<T>(sql, p)).rows;

beforeAll(async () => {
  pg = await testDatabase();
  h.db = fakeSupabase(pg);
}, 60000);
beforeEach(async () => {
  await pg.exec(`delete from video_events;`);
});

describe("validatie", () => {
  it("accepteert een geldig event en normaliseert de bron", () => {
    const r = leesBody(JSON.stringify({ ...geldig, source: " Larissa_WhatsApp " }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.source).toBe("larissa_whatsapp");
  });
  it("utm is optioneel en wordt een leeg object", () => {
    const { utm: _u, ...zonder } = geldig;
    void _u;
    const r = leesBody(JSON.stringify(zonder));
    expect(r.ok && r.data.utm).toEqual({});
  });
  it.each([
    ["onbekend event", { ...geldig, event: "click" }],
    ["onbekende pagina", { ...geldig, page: "home" }],
    ["bron met spaties", { ...geldig, source: "twee woorden" }],
    ["bron te lang", { ...geldig, source: "a".repeat(41) }],
    ["geen uuid", { ...geldig, visitor_id: "abc" }],
    ["utm-waarde te lang", { ...geldig, utm: { utm_source: "x".repeat(101) } }],
    ["utm-waarde geen tekst", { ...geldig, utm: { utm_source: 5 } }],
    ["vreemde Calendly-URI", { ...geldig, event: "booked", calendly_event_uri: "https://evil.example/x" }],
  ])("weigert %s", (_n, body) => {
    expect(leesBody(JSON.stringify(body)).ok).toBe(false);
  });
  it("weigert geen JSON en te grote bodies", () => {
    expect(leesBody("niet json").ok).toBe(false);
    expect(leesBody(JSON.stringify({ ...geldig, referrer: "x".repeat(5000) })).ok).toBe(false);
  });
  it("slaat geen querystring van de verwijzer en geen ruwe user agent op", () => {
    const r = leesBody(JSON.stringify(geldig));
    if (!r.ok) throw new Error("ongeldig");
    const row = videoRow(r.data, "Mozilla/5.0 Test");
    expect(row.referrer).toBe("https://l.instagram.com/");
    expect(row.user_agent_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("Mozilla");
    expect(schoneVerwijzer("javascript:alert(1)")).toBeNull();
  });
  it("bewaart Calendly-URI's alleen bij een boeking", () => {
    const r = leesBody(JSON.stringify({ ...geldig, event: "play", calendly_event_uri: EV }));
    if (!r.ok) throw new Error("ongeldig");
    expect(videoRow(r.data, null).calendly_event_uri).toBeNull();
  });
});

describe("CORS", () => {
  it.each(["https://beautyspecialist.io", "https://www.beautyspecialist.io", "https://beauty-staging.vercel.app", "https://beauty-specialist-abc123-gewoon-doen.vercel.app"])("staat %s toe", (o) => {
    expect(originToegestaan(o)).toBe(true);
  });
  it.each([null, "", "http://beautyspecialist.io", "https://evil.example", "https://beautyspecialist.io.evil.example", "https://beauty-specialist-x.vercel.app.evil.example", "https://other-project.vercel.app"])("weigert %s", (o) => {
    expect(originToegestaan(o)).toBe(false);
  });
  it("preflight: 204 met headers voor een toegestane origin, 403 anders", () => {
    const ok = OPTIONS(new Request("https://crm.voorbeeld.nl/api/track/video", { method: "OPTIONS", headers: { origin: ORIGIN } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(ok.headers.get("access-control-allow-methods")).toContain("POST");
    const nee = OPTIONS(new Request("https://crm.voorbeeld.nl/api/track/video", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(nee.status).toBe(403);
    expect(nee.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("POST /api/track/video", () => {
  const post = (body: unknown, origin: string | null = ORIGIN, type = "text/plain;charset=UTF-8", ip = "198.51.100.1") =>
    POST(
      new Request("https://crm.voorbeeld.nl/api/track/video", {
        method: "POST",
        headers: { "content-type": type, "user-agent": "Mozilla/5.0 Test", "x-forwarded-for": ip, ...(origin ? { origin } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  it("slaat een event op uit text/plain (sendBeacon) en uit application/json", async () => {
    const a = await post(geldig);
    expect(a.status).toBe(204);
    expect(a.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const b = await post({ ...geldig, event: "booked", calendly_event_uri: EV, calendly_invitee_uri: INV }, ORIGIN, "application/json");
    expect(b.status).toBe(204);
    const r = await rows<Record<string, unknown>>(`select * from video_events order by created_at, event desc`);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.event === "booked")).toMatchObject({ calendly_event_uri: EV, calendly_invitee_uri: INV, source: "raphael", page: "video" });
    expect(r[0].utm).toEqual({ utm_source: "ig" });
  });
  it("schrijft niets bij een vreemde origin of een ongeldige body", async () => {
    expect((await post(geldig, "https://evil.example")).status).toBe(403);
    expect((await post(geldig, null)).status).toBe(403);
    expect((await post({ ...geldig, visitor_id: "x" })).status).toBe(400);
    expect((await post("{kapot")).status).toBe(400);
    expect(await rows(`select id from video_events`)).toHaveLength(0);
  });
  it("begrenst per IP", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 60; i++) expect((await post(geldig, ORIGIN, "text/plain", ip)).status).toBe(204);
    expect((await post(geldig, ORIGIN, "text/plain", ip)).status).toBe(429);
    expect((await post(geldig, ORIGIN, "text/plain", "203.0.113.10")).status).toBe(204);
  });
});

describe("rate limit", () => {
  it("telt per venster en reset daarna", () => {
    const rl = maakRateLimit(2, 1000);
    expect([rl("a", 0), rl("a", 10), rl("a", 20), rl("b", 20)]).toEqual([true, true, false, true]);
    expect(rl("a", 1000)).toBe(true);
  });
});

describe("aggregatie video_bronnen", () => {
  const T = "2026-10-30T10:00:00Z";
  const ins = (event: string, page: string, source: string, visitor: string, at = T, invitee: string | null = null) =>
    pg.query(`insert into video_events (event, page, source, visitor_id, created_at, calendly_invitee_uri) values ($1, $2, $3, $4, $5, $6)`, [event, page, source, visitor, at, invitee]);

  it("telt unieke bezoekers, plays, Calendly-weergaven en boekingen per bron en pagina", async () => {
    // raphael op /video: twee bezoekers (V1 twee keer view), V1 speelt af, bekijkt Calendly en boekt.
    await ins("view", "video", "raphael", V1);
    await ins("view", "video", "raphael", V1);
    await ins("play", "video", "raphael", V1);
    await ins("calendly_view", "video", "raphael", V1);
    await ins("booked", "video", "raphael", V1, T, `${INV}A`);
    await ins("view", "video", "raphael", V2);
    // setter op /video-2: één bezoeker, geen boeking.
    await ins("view", "video-2", "setter", V3);
    await ins("play", "video-2", "setter", V3);
    // raphael ook op /video-2 (zelfde browser V2).
    await ins("view", "video-2", "raphael", V2);
    // Buiten de periode: telt niet.
    await ins("view", "video", "raphael", V3, "2026-09-01T10:00:00Z");

    const r = await videoBronnen("2026-10-23T00:00:00Z", "2026-10-31T00:00:00Z");
    const vind = (s: string | null, p: string | null) => r.find((x) => x.source === s && x.page === p) as BronRij;
    expect(vind("raphael", "video")).toEqual({ source: "raphael", page: "video", bezoekers: 2, plays: 1, calendly_views: 1, boekingen: 1 });
    expect(vind("raphael", "video-2")).toMatchObject({ bezoekers: 1, boekingen: 0 });
    // Subtotaal per bron telt V2 maar één keer, ook al bezocht die beide pagina's.
    expect(vind("raphael", null)).toMatchObject({ bezoekers: 2, plays: 1, boekingen: 1 });
    expect(vind("setter", "video-2")).toMatchObject({ bezoekers: 1, plays: 1, calendly_views: 0, boekingen: 0 });
    expect(vind(null, null)).toMatchObject({ bezoekers: 3, plays: 2, boekingen: 1 });
    expect(conversie(vind("raphael", "video"))).toBe(50);
  });
  it("geeft zonder events alleen een totaal met nullen", async () => {
    const r = await videoBronnen("2026-10-23T00:00:00Z");
    expect(r).toEqual([{ source: null, page: null, bezoekers: 0, plays: 0, calendly_views: 0, boekingen: 0 }]);
    expect(conversie(r[0])).toBeNull();
  });
  it("is dicht voor anon en authenticated (RLS aan, geen rechten)", async () => {
    const rls = await rows<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'video_events'`);
    expect(rls[0].relrowsecurity).toBe(true);
    const rechten = await rows<{ anon: boolean; auth: boolean; fn: boolean }>(
      `select has_table_privilege('anon', 'video_events', 'insert') as anon, has_table_privilege('authenticated', 'video_events', 'select') as auth,
        has_function_privilege('anon', 'video_bronnen(timestamptz, timestamptz)', 'execute') as fn`,
    );
    expect(rechten[0]).toEqual({ anon: false, auth: false, fn: false });
  });
});

describe("labels en periode", () => {
  it("geeft vriendelijke namen, andere bronnen zoals ze zijn", () => {
    expect(["raphael", "setter", "larissa_whatsapp", "organisch", "facebook"].map(bronLabel)).toEqual(["Raphael", "Setter", "Larissa (WhatsApp)", "Organisch", "facebook"]);
  });
  it("vandaag begint om 00:00 Amsterdam, 7 en 30 dagen terug vanaf nu", () => {
    const nu = new Date("2026-11-03T10:00:00Z");
    expect(periodeVan("vandaag", nu, amsterdamMidnight)).toBe("2026-11-02T23:00:00.000Z");
    expect(periodeVan("7d", nu, amsterdamMidnight)).toBe("2026-10-27T10:00:00.000Z");
    expect(periodeVan("30d", nu, amsterdamMidnight)).toBe("2026-10-04T10:00:00.000Z");
  });
});
