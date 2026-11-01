import { createHmac } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, testDatabase } from "./helpers/pglite-db";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ db: () => h.db }));

import { GET, POST } from "@/app/api/ig/webhook/route";
import { leadTelling, type IgCard } from "@/components/crm/ig-board";
import type { CrmUser } from "@/lib/crm/server";
import { igSync, zetBestaandeKlant, zetIgFase } from "@/lib/ig/server";
import { handtekeningKlopt, leesWebhook, scriptFase, webhookChallenge } from "@/lib/ig/webhook";

// Alles verzonnen: ids, gebruikersnamen en berichten bestaan niet. Geen echte sleutels.
const EIGEN = "17840000000000001"; // eigen (verzonnen) IG-professional-account
const LEAD = "9900000000000001"; // Instagram-scoped id van een verzonnen lead
const LEAD2 = "9900000000000002";
const GEHEIM = "test-app-secret";
const T0 = Date.parse("2026-10-30T10:00:00Z");

/** Webhook in de vorm uit Meta's documentatie (object instagram, entry[].messaging[]). */
const leadEvent = (mid: string, text: string, ts = T0, lead = LEAD) => ({
  object: "instagram",
  entry: [{ id: EIGEN, time: ts + 500, messaging: [{ sender: { id: lead }, recipient: { id: EIGEN }, timestamp: ts, message: { mid, text } }] }],
});
/** message_echoes: door ons verstuurd, is_echo true, afzender is het eigen account. */
const echoEvent = (mid: string, text: string, ts = T0, lead = LEAD) => ({
  object: "instagram",
  entry: [{ id: EIGEN, time: ts + 500, messaging: [{ sender: { id: EIGEN }, recipient: { id: lead }, timestamp: ts, message: { mid, text, is_echo: true } }] }],
});

const sign = (raw: string, secret = GEHEIM) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
const post = (body: unknown, sig?: string | null) => {
  const raw = JSON.stringify(body);
  return POST(
    new Request("https://crm.voorbeeld.nl/api/ig/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...(sig === null ? {} : { "x-hub-signature-256": sig ?? sign(raw) }) },
      body: raw,
    }),
  );
};

let pg: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await pg.query<T>(sql, p)).rows;
const thread = async (lead = LEAD) => (await rows<Record<string, unknown>>(`select * from ig_threads where lead_ig_id = $1`, [lead]))[0];
const admin: CrmUser = { rol: "admin", email: "admin@voorbeeld.nl", setter: null };

// Graph-call voor de gebruikersnaam: nagebootst, nooit het echte Instagram.
const graph = vi.fn(async (url: string, _init?: RequestInit) => {
  void _init;
  return new Response(JSON.stringify({ username: url.includes(LEAD2) ? "kapsalon.verzonnen" : "salon.verzonnen", id: "x" }), { status: 200 });
});

beforeAll(async () => {
  pg = await testDatabase();
  h.db = fakeSupabase(pg);
}, 60000);

beforeEach(async () => {
  await pg.exec(`delete from crm_activities; delete from crm_opportunities; delete from crm_appointments; delete from crm_contacts;
    delete from ig_messages; delete from ig_threads; delete from ig_accounts; delete from ig_webhook_events; delete from ig_sync_runs;`);
  process.env.IG_APP_SECRET = GEHEIM;
  process.env.IG_WEBHOOK_VERIFY_TOKEN = "verzonnen-verify-token";
  process.env.IG_ACCESS_TOKEN = "verzonnen-token";
  process.env.IG_OWN_ID = EIGEN;
  delete process.env.IG_SALES_OVERDRACHT;
  graph.mockClear();
  vi.stubGlobal("fetch", graph);
});
afterEach(() => vi.unstubAllGlobals());

describe("Instagram-webhook: verificatie (GET)", () => {
  const get = (q: string) => GET(new Request(`https://crm.voorbeeld.nl/api/ig/webhook?${q}`));

  it("geeft hub.challenge terug als platte tekst bij het juiste token", async () => {
    const r = await get("hub.mode=subscribe&hub.verify_token=verzonnen-verify-token&hub.challenge=1158201444");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("1158201444");
    expect(r.headers.get("content-type")).toMatch(/text\/plain/);
  });

  it("geeft 403 bij een fout token, een andere mode of zonder ingesteld token", async () => {
    expect((await get("hub.mode=subscribe&hub.verify_token=fout&hub.challenge=1")).status).toBe(403);
    expect((await get("hub.mode=unsubscribe&hub.verify_token=verzonnen-verify-token&hub.challenge=1")).status).toBe(403);
    delete process.env.IG_WEBHOOK_VERIFY_TOKEN;
    expect((await get("hub.mode=subscribe&hub.verify_token=&hub.challenge=1")).status).toBe(403);
    expect(webhookChallenge(new URLSearchParams("hub.mode=subscribe&hub.verify_token=a&hub.challenge=1"), undefined)).toBeNull();
  });
});

describe("Instagram-webhook: handtekening", () => {
  it("controleert sha256=HMAC van de ruwe body met het App Secret", () => {
    const raw = '{"object":"instagram"}';
    expect(handtekeningKlopt(raw, sign(raw), GEHEIM)).toBe(true);
    expect(handtekeningKlopt(raw, sign(raw, "ander-geheim"), GEHEIM)).toBe(false);
    expect(handtekeningKlopt(raw + " ", sign(raw), GEHEIM)).toBe(false);
    expect(handtekeningKlopt(raw, sign(raw).replace("sha256=", ""), GEHEIM)).toBe(false);
    expect(handtekeningKlopt(raw, null, GEHEIM)).toBe(false);
    expect(handtekeningKlopt(raw, sign(raw, ""), undefined)).toBe(false);
  });

  it("ongeldige of ontbrekende handtekening: 401 en er wordt niets geschreven", async () => {
    expect((await post(leadEvent("mid.verzonnen.1", "Hoi"), "sha256=" + "0".repeat(64))).status).toBe(401);
    expect((await post(leadEvent("mid.verzonnen.1", "Hoi"), null)).status).toBe(401);
    expect((await post(leadEvent("mid.verzonnen.1", "Hoi"), sign("iets anders"))).status).toBe(401);
    delete process.env.IG_APP_SECRET;
    expect((await post(leadEvent("mid.verzonnen.1", "Hoi"), sign(JSON.stringify(leadEvent("mid.verzonnen.1", "Hoi")), ""))).status).toBe(401);
    for (const t of ["ig_webhook_events", "ig_threads", "ig_messages", "ig_accounts"]) expect(await rows(`select 1 from ${t}`)).toHaveLength(0);
    expect(graph).not.toHaveBeenCalled();
  });
});

describe("Instagram-webhook: berichten", () => {
  it("een lead-event maakt gesprek en bericht aan, vult de gebruikersnaam aan en logt het event", async () => {
    const r = await post(leadEvent("mid.verzonnen.1", "Hoi, wat kost een behandeling?"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, status: "verwerkt", berichten: 1 });

    const t = await thread();
    expect(t).toMatchObject({ lead_ig_id: LEAD, gestart_door: "lead", laatste_van: "lead", laatste_tekst: "Hoi, wat kost een behandeling?", fase: "in_gesprek", fase_bron: "script" });
    expect(t.ig_conversation_id).toBe(`igsid:${LEAD}`);
    expect((t.wacht_op_ons_sinds as Date).toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(t.lead_gebruikersnaam).toBe("salon.verzonnen");
    expect(await rows(`select van, tekst from ig_messages`)).toEqual([{ van: "lead", tekst: "Hoi, wat kost een behandeling?" }]);
    expect(await rows(`select status, berichten from ig_webhook_events`)).toEqual([{ status: "verwerkt", berichten: 1 }]);
    expect(await rows(`select ig_user_id from ig_accounts`)).toEqual([{ ig_user_id: EIGEN }]);

    // Alleen lezen richting Instagram: één GET naar /{igsid}?fields=username.
    expect(graph).toHaveBeenCalledTimes(1);
    const [url, init] = graph.mock.calls[0];
    expect(url).toMatch(new RegExp(`^https://graph\\.instagram\\.com/v\\d+\\.0/${LEAD}\\?fields=username&`));
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("een echo-event zet de richting op 'wij' en wist de wacht-op-ons-status", async () => {
    await post(leadEvent("mid.verzonnen.1", "Vertel eens meer"));
    expect((await thread()).wacht_op_ons_sinds).not.toBeNull();
    const r = await post(echoEvent("mid.verzonnen.2", "Hier is een korte video: https://www.loom.com/share/verzonnen", T0 + 10 * 60000));
    expect(r.status).toBe(200);
    const t = await thread();
    expect(t).toMatchObject({ laatste_van: "wij", wacht_op_ons_sinds: null, fase: "video_gestuurd" });
    expect(await rows(`select ig_message_id, van, links from ig_messages order by verzonden_op`)).toEqual([
      { ig_message_id: "mid.verzonnen.1", van: "lead", links: [] },
      { ig_message_id: "mid.verzonnen.2", van: "wij", links: ["https://www.loom.com/share/verzonnen"] },
    ]);
  });

  it("hetzelfde event twee keer geeft één bericht (ook als Meta het in een andere levering stuurt)", async () => {
    const ev = leadEvent("mid.verzonnen.1", "Hoi");
    expect(await (await post(ev)).json()).toMatchObject({ status: "verwerkt" });
    expect(await (await post(ev)).json()).toMatchObject({ status: "dubbel" });
    // Andere levering (andere body), zelfde mid.
    const ander = { ...ev, entry: [{ ...ev.entry[0], time: T0 + 9999 }] };
    expect((await post(ander)).status).toBe(200);
    expect(await rows(`select 1 from ig_messages`)).toHaveLength(1);
    expect(await rows(`select 1 from ig_threads`)).toHaveLength(1);
    expect(await rows(`select 1 from ig_webhook_events`)).toHaveLength(2);
  });

  it("een handmatig gezette fase blijft staan bij nieuwe berichten", async () => {
    await post(leadEvent("mid.verzonnen.1", "Hoi"));
    await pg.query(`update ig_threads set fase = 'geen_interesse', fase_bron = 'handmatig' where lead_ig_id = $1`, [LEAD]);
    await post(echoEvent("mid.verzonnen.2", "Plan hier je gesprek: https://calendly.com/verzonnen/kennismaking", T0 + 60000));
    await post(leadEvent("mid.verzonnen.3", "Top, dank je", T0 + 120000));
    const t = await thread();
    expect(t).toMatchObject({ fase: "geen_interesse", fase_bron: "handmatig", laatste_tekst: "Top, dank je" });
    expect(t.bookinglink_op).not.toBeNull();
  });

  it("zet een fase van het brein niet terug naar een scriptfase", async () => {
    await post(leadEvent("mid.verzonnen.1", "Hoi"));
    await pg.query(`update ig_threads set fase = 'call_geboekt', fase_bron = 'brein' where lead_ig_id = $1`, [LEAD]);
    await post(leadEvent("mid.verzonnen.2", "Tot morgen!", T0 + 60000));
    expect(await thread()).toMatchObject({ fase: "call_geboekt", fase_bron: "brein" });
  });

  it("autoreply van de lead telt niet als echte reactie", async () => {
    await post(echoEvent("mid.verzonnen.1", "Hoi! Even een vraag over je salon."));
    await post(leadEvent("mid.verzonnen.2", "Bedankt voor je bericht, we reageren zo snel mogelijk.", T0 + 60000));
    expect(await thread()).toMatchObject({ fase: "opener_gestuurd", gestart_door: "wij", wacht_op_ons_sinds: null });
  });

  it("gebruikersnaam opzoeken faalt zacht: het id blijft staan en Meta krijgt 200", async () => {
    graph.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    expect((await post(leadEvent("mid.verzonnen.1", "Hoi"))).status).toBe(200);
    expect(await thread()).toMatchObject({ lead_ig_id: LEAD, lead_gebruikersnaam: null });
    graph.mockImplementationOnce(async () => {
      throw new Error("netwerk weg");
    });
    expect((await post(leadEvent("mid.verzonnen.2", "Hoi", T0, LEAD2))).status).toBe(200);
    expect(await thread(LEAD2)).toMatchObject({ lead_gebruikersnaam: null });
    delete process.env.IG_ACCESS_TOKEN;
    graph.mockClear();
    await post(leadEvent("mid.verzonnen.3", "Nog eens", T0 + 1000));
    expect(graph).not.toHaveBeenCalled();
  });

  it("zonder IG_OWN_ID geldt het account uit ig_accounts als eigen account", async () => {
    delete process.env.IG_OWN_ID;
    await pg.query(`insert into ig_accounts (ig_user_id, gebruikersnaam) values ($1, 'eigen.verzonnen')`, [EIGEN]);
    // Echo zonder is_echo-vlag: de afzender is het eigen account, dus "wij".
    const ev = echoEvent("mid.verzonnen.1", "Hoi!");
    delete (ev.entry[0].messaging[0].message as { is_echo?: boolean }).is_echo;
    await post(ev);
    expect(await rows(`select van from ig_messages`)).toEqual([{ van: "wij" }]);
    expect(await thread()).toMatchObject({ gestart_door: "wij", fase: "opener_gestuurd" });
  });

  it("negeert events zonder bericht (read, reacties), verwijderde berichten en ander object", async () => {
    const read = { object: "instagram", entry: [{ id: EIGEN, time: T0, messaging: [{ sender: { id: LEAD }, recipient: { id: EIGEN }, timestamp: T0, read: { mid: "mid.verzonnen.1" } }] }] };
    expect(await (await post(read)).json()).toMatchObject({ status: "genegeerd" });
    const weg = leadEvent("mid.verzonnen.2", "x");
    (weg.entry[0].messaging[0].message as { is_deleted?: boolean }).is_deleted = true;
    expect(await (await post(weg)).json()).toMatchObject({ status: "genegeerd" });
    expect(await (await post({ object: "page", entry: [] })).json()).toMatchObject({ status: "genegeerd" });
    expect(await rows(`select 1 from ig_messages`)).toHaveLength(0);
  });

  it("leest bijlagen en story-reacties uit de payload", () => {
    const ev = leadEvent("mid.verzonnen.1", "");
    Object.assign(ev.entry[0].messaging[0].message, {
      attachments: [{ type: "image", payload: { url: "https://voorbeeld.nl/a.jpg" } }, { type: "ig_reel", payload: { url: "https://voorbeeld.nl/r" } }],
      reply_to: { story: { url: "https://voorbeeld.nl/s", id: "1" } },
    });
    const [b] = leesWebhook(ev, EIGEN);
    expect(b.bericht).toMatchObject({ tekst: null, van: "lead", verzonden_op: "2026-10-30T10:00:00.000Z" });
    expect(b.bericht.extra.sort()).toEqual(["bijlage", "gedeelde post", "story-reactie"]);
  });

  it("de sync neemt een gesprek van de webhook over zodra het echte gesprek-id bekend is", async () => {
    await post(leadEvent("mid.verzonnen.1", "Hoi"));
    await igSync({
      account: { ig_user_id: EIGEN },
      threads: [{ ig_conversation_id: "conv-verzonnen-1", lead_ig_id: LEAD, messages: [{ ig_message_id: "mid.verzonnen.1", van: "lead", verzonden_op: "2026-10-30T10:00:00Z", tekst: "Hoi" }] }],
      metrics: [],
    });
    expect(await rows(`select ig_conversation_id from ig_threads`)).toEqual([{ ig_conversation_id: "conv-verzonnen-1" }]);
    expect(await rows(`select 1 from ig_messages`)).toHaveLength(1);
  });

  it("scriptFase volgt de regels van het sync-script", () => {
    const m = (van: "wij" | "lead", tekst: string, min: number, x: Partial<{ is_bookinglink: boolean; is_autoreply: boolean }> = {}) => ({
      van,
      tekst,
      verzonden_op: new Date(T0 + min * 60000).toISOString(),
      is_bookinglink: false,
      is_autoreply: false,
      ...x,
    });
    expect(scriptFase([]).fase).toBeNull();
    expect(scriptFase([m("wij", "Hoi", 0)]).fase).toBe("opener_gestuurd");
    expect(scriptFase([m("wij", "Hoi", 0), m("lead", "Ja?", 1)]).fase).toBe("in_gesprek");
    expect(scriptFase([m("wij", "https://loom.com/x", 0), m("wij", "calendly.com/x", 1, { is_bookinglink: true })])).toEqual({ fase: "bookinglink_gestuurd", bookinglinkOp: new Date(T0 + 60000).toISOString() });
    expect(scriptFase([m("wij", "calendly.com/x", 0, { is_bookinglink: true }), m("wij", "https://loom.com/x", 1)]).fase).toBe("video_gestuurd");
  });
});

describe("Klantlabel", () => {
  it("alleen de admin zet het label; klanten tellen niet als lead", async () => {
    await post(leadEvent("mid.verzonnen.1", "Hoi"));
    const id = (await thread()).id as string;
    const setter = { rol: "setter", email: "setter@voorbeeld.nl", setter: { id: "00000000-0000-4000-8000-0000000000aa" } } as unknown as CrmUser;
    await expect(zetBestaandeKlant(setter, id, true)).rejects.toMatchObject({ status: 403 });
    await zetBestaandeKlant(admin, id, true);
    expect((await thread()).bestaande_klant).toBe(true);
    // De sync laat het label staan als hij het niet meestuurt.
    await post(leadEvent("mid.verzonnen.2", "Nog een vraag", T0 + 60000));
    expect((await thread()).bestaande_klant).toBe(true);

    const kaart = (x: Partial<IgCard>): IgCard => ({ id: "k", fase: "in_gesprek", gebruikersnaam: null, laatsteTekst: null, laatsteVan: null, laatsteOp: null, wachtSinds: null, handmatig: false, bestaandeKlant: false, contactId: null, ...x });
    expect(leadTelling([kaart({}), kaart({ bestaandeKlant: true }), kaart({})])).toHaveLength(2);
  });
});

describe("Call geboekt → sales", () => {
  const maakGesprek = async () => {
    await post(leadEvent("mid.verzonnen.1", "Ik heb een afspraak ingepland"));
    return (await thread()).id as string;
  };
  const tel = async (t: string, w = "") => (await rows(`select 1 from ${t} ${w}`)).length;

  it("staat de overdracht uit: niets in het CRM, de kaart meldt het", async () => {
    const id = await maakGesprek();
    process.env.IG_SALES_OVERDRACHT = "uit";
    expect(await zetIgFase(admin, id, "call_geboekt")).toEqual({ overdracht: "uit" });
    delete process.env.IG_SALES_OVERDRACHT;
    expect(await zetIgFase(admin, id, "call_geboekt")).toEqual({ overdracht: "uit" });
    expect(await tel("crm_contacts")).toBe(0);
    expect(await tel("crm_opportunities")).toBe(0);
    expect(await tel("crm_activities")).toBe(0);
    expect(await thread()).toMatchObject({ fase: "call_geboekt", fase_bron: "handmatig", contact_id: null });
  });

  it("staat de overdracht aan: lead op Ingepland in sales, gekoppeld en gelogd; een tweede keer dubbelt niets", async () => {
    const id = await maakGesprek();
    process.env.IG_SALES_OVERDRACHT = "aan";
    expect(await zetIgFase(admin, id, "call_geboekt")).toEqual({ overdracht: "aangemaakt" });

    const [c] = await rows<{ id: string; salon_naam: string; bron: string; bron_url: string }>(`select id, salon_naam, bron, bron_url from crm_contacts`);
    expect(c).toMatchObject({ salon_naam: "@salon.verzonnen", bron: "instagram", bron_url: "https://www.instagram.com/salon.verzonnen/" });
    expect(await rows(`select pijplijn, fase from crm_opportunities where contact_id = $1 order by pijplijn`, [c.id])).toEqual([
      { pijplijn: "outbound", fase: "ingepland" },
      { pijplijn: "sales", fase: "ingepland" },
    ]);
    expect((await thread()).contact_id).toBe(c.id);
    const act = await rows<{ type: string; tekst: string }>(`select type, tekst from crm_activities where contact_id = $1 order by created_at`, [c.id]);
    expect(act.map((a) => a.type)).toEqual(expect.arrayContaining(["import", "fase", "instagram"]));
    expect(act.find((a) => a.type === "instagram")!.tekst).toMatch(/doorgezet naar sales/);

    // Opnieuw naar Call geboekt (bijv. na terugslepen): geen tweede contact, kaart of log.
    await zetIgFase(admin, id, "in_gesprek");
    expect(await zetIgFase(admin, id, "call_geboekt")).toEqual({ overdracht: "al_gekoppeld" });
    expect(await tel("crm_contacts")).toBe(1);
    expect(await tel("crm_opportunities")).toBe(2);
    expect(await tel("crm_activities", "where type = 'instagram'")).toBe(1);
  });

  it("koppelt aan het bestaande contact van de Calendly-afspraak in plaats van een nieuw contact", async () => {
    const id = await maakGesprek();
    const [c] = await rows<{ id: string }>(`insert into crm_contacts (salon_naam, bron) values ('Salon Verzonnen', 'calendly') returning id`);
    await pg.query(
      `insert into crm_appointments (contact_id, type, status, start_op, calendly_invitee_uri, attributie) values ($1, 'kennismaking', 'gepland', '2026-11-03T10:00:00Z', 'https://api.calendly.com/invitees/verzonnen', 'geen')`,
      [c.id],
    );
    await pg.query(`update ig_threads set calendly_invitee_uri = 'https://api.calendly.com/invitees/verzonnen' where id = $1`, [id]);
    process.env.IG_SALES_OVERDRACHT = "aan";
    expect(await zetIgFase(admin, id, "call_geboekt")).toEqual({ overdracht: "gekoppeld" });
    expect(await tel("crm_contacts")).toBe(1);
    expect((await thread()).contact_id).toBe(c.id);
    expect(await rows(`select pijplijn, fase from crm_opportunities`)).toEqual([{ pijplijn: "sales", fase: "ingepland" }]);
  });

  it("ook als het brein Call geboekt zet via de sync (alleen met de vlag aan)", async () => {
    await maakGesprek();
    const brein = () =>
      igSync({ account: { ig_user_id: EIGEN }, threads: [{ ig_conversation_id: `igsid:${LEAD}`, fase: "call_geboekt", fase_bron: "brein", messages: [] }], metrics: [] });
    await brein();
    expect(await thread()).toMatchObject({ fase: "call_geboekt", fase_bron: "brein", contact_id: null });
    expect(await tel("crm_contacts")).toBe(0);

    process.env.IG_SALES_OVERDRACHT = "aan";
    await brein();
    const t = await thread();
    expect(t.contact_id).not.toBeNull();
    expect(await rows(`select door from crm_activities where type = 'instagram'`)).toEqual([{ door: "brein" }]);
  });

  it("andere fases zetten nooit iets door", async () => {
    const id = await maakGesprek();
    process.env.IG_SALES_OVERDRACHT = "aan";
    expect(await zetIgFase(admin, id, "bookinglink_gestuurd")).toEqual({});
    expect(await tel("crm_contacts")).toBe(0);
  });
});
