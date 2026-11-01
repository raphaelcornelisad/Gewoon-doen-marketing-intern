import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { igSync } = vi.hoisted(() => ({ igSync: vi.fn(async () => ({ run: "r1", gesprekken: 1, berichten_nieuw: 1, dagen: 0 })) }));
vi.mock("@/lib/ig/server", () => ({ igSync }));

import { POST } from "@/app/api/ig/sync/route";
import { igSyncGeautoriseerd } from "@/lib/ig/auth";
import { blijvenLiggen, duurTekst, IG_PIJPLIJN, instagramLink, kortBericht, tegelWaarde, wachtMinuten } from "@/lib/ig/core";
import { igSyncSchema } from "@/lib/ig/schema";

// Verzonnen testdata; geen echte gesprekken of gebruikersnamen.
const payload = {
  account: { ig_user_id: "test-account-1" },
  threads: [{ ig_conversation_id: "conv-a", lead_gebruikersnaam: "salon.verzonnen", messages: [{ ig_message_id: "m1", van: "lead", verzonden_op: "2026-10-30T10:00:00Z", tekst: "Hoi" }] }],
};
const req = (body: unknown, auth?: string) =>
  new Request("http://localhost/api/ig/sync", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });

describe("Instagram-pijplijn", () => {
  beforeEach(() => {
    igSync.mockClear();
    process.env.IG_SYNC_SECRET = "test-geheim";
  });

  it("toont geen kolommen voor intern en spam", () => {
    expect(IG_PIJPLIJN.map((f) => f.key)).toEqual(["opener_gestuurd", "in_gesprek", "video_gestuurd", "bookinglink_gestuurd", "call_geboekt", "geen_interesse", "niet_bruikbaar"]);
  });

  it("geeft 'wacht op ons' pas boven 30 minuten", () => {
    const nu = new Date("2026-10-30T12:00:00Z");
    expect(wachtMinuten("2026-10-30T11:31:00Z", nu)).toBeNull();
    expect(wachtMinuten("2026-10-30T11:29:00Z", nu)).toBe(31);
    expect(wachtMinuten(null, nu)).toBeNull();
    // Na 7 dagen geen rode badge meer, maar blijven liggen.
    expect(wachtMinuten("2026-10-23T12:00:00Z", nu)).toBe(7 * 1440);
    expect(wachtMinuten("2026-10-23T11:59:00Z", nu)).toBeNull();
    expect(blijvenLiggen("2026-10-23T11:59:00Z", nu)).toBe(true);
    expect(blijvenLiggen("2026-10-30T11:29:00Z", nu)).toBe(false);
    expect(blijvenLiggen(null, nu)).toBe(false);
    expect(duurTekst(31)).toBe("31 min");
    expect(duurTekst(190)).toBe("3 u 10 min");
    expect(duurTekst(60 * 52)).toBe("2 d 4 u");
  });

  it("kort het laatste bericht in tot 90 tekens", () => {
    expect(kortBericht("a".repeat(200))).toHaveLength(90);
    expect(kortBericht("  twee\n regels ")).toBe("twee regels");
  });

  it("maakt een veilige Instagram-link", () => {
    expect(instagramLink("salon.verzonnen")).toBe("https://ig.me/m/salon.verzonnen");
    expect(instagramLink("x/../evil")).toBe("https://www.instagram.com/direct/inbox/");
    expect(instagramLink(null)).toBe("https://www.instagram.com/direct/inbox/");
  });

  it("toont null als 'nog niet beoordeeld' en 0 als 0", () => {
    expect(tegelWaarde(null)).toBe("nog niet beoordeeld");
    expect(tegelWaarde(0)).toBe("0");
    expect(tegelWaarde("12.5", true)).toBe("12,5%");
  });

  it("weigert 'handmatig' en onbekende fases vanuit de sync", () => {
    const t = (x: object) => igSyncSchema.safeParse({ ...payload, threads: [{ ...payload.threads[0], ...x }] }).success;
    expect(t({ fase: "in_gesprek", fase_bron: "brein" })).toBe(true);
    expect(t({ fase_bron: "handmatig" })).toBe(false);
    expect(t({ fase: "nieuw" })).toBe(false);
    expect(t({ messages: [{ ig_message_id: "m1", van: "iemand", verzonden_op: "2026-10-30T10:00:00Z" }] })).toBe(false);
  });

  it("controleert de Bearer-header", () => {
    expect(igSyncGeautoriseerd("Bearer test-geheim", "test-geheim")).toBe(true);
    expect(igSyncGeautoriseerd("Bearer fout", "test-geheim")).toBe(false);
    expect(igSyncGeautoriseerd(null, "test-geheim")).toBe(false);
    expect(igSyncGeautoriseerd("Bearer ", undefined)).toBe(false);
  });

  it("route: 401 zonder of met verkeerd geheim, ook als het geheim niet is ingesteld", async () => {
    expect((await POST(req(payload))).status).toBe(401);
    expect((await POST(req(payload, "Bearer fout"))).status).toBe(401);
    delete process.env.IG_SYNC_SECRET;
    expect((await POST(req(payload, "Bearer undefined"))).status).toBe(401);
    expect(igSync).not.toHaveBeenCalled();
  });

  it("route: 400 bij een ongeldige payload, 200 bij een geldige", async () => {
    expect((await POST(req({ account: {} }, "Bearer test-geheim"))).status).toBe(400);
    const ok = await POST(req(payload, "Bearer test-geheim"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, berichten_nieuw: 1 });
    expect(igSync).toHaveBeenCalledTimes(1);
  });
});
