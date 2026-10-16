import { describe, expect, it } from "vitest";
import { isAdminEmail, signSession, verifySession } from "@/lib/auth/token";

const S = "geheim";

describe("admin-sessie", () => {
  it("accepteert een geldige, ondertekende sessie", () => {
    const v = signSession({ email: "a@b.nl", exp: Date.now() / 1000 + 60 }, S);
    expect(verifySession(v, S)?.email).toBe("a@b.nl");
  });
  it("weigert verlopen, vervalste of ontbrekende sessies", () => {
    expect(verifySession(signSession({ email: "a@b.nl", exp: Date.now() / 1000 - 1 }, S), S)).toBeNull();
    const v = signSession({ email: "a@b.nl", exp: Date.now() / 1000 + 60 }, S);
    expect(verifySession(v, "ander-geheim")).toBeNull();
    const [, mac] = v.split(".");
    const fake = Buffer.from(JSON.stringify({ email: "x@y.nl", exp: 9e9 })).toString("base64url");
    expect(verifySession(`${fake}.${mac}`, S)).toBeNull();
    expect(verifySession(undefined, S)).toBeNull();
  });
  it("vergelijkt het admin-adres hoofdletterongevoelig", () => {
    expect(isAdminEmail(" Raphaelcornelis@GewoonDoenMarketing.nl", "raphaelcornelis@gewoondoenmarketing.nl")).toBe(true);
    expect(isAdminEmail("iemand@anders.nl", "raphaelcornelis@gewoondoenmarketing.nl")).toBe(false);
  });
});
