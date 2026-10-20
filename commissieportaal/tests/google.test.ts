import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ db: () => ({}) }));
process.env.ADMIN_SESSION_SECRET = "test-geheim-voor-google-state-123456";
process.env.APP_URL = "https://sales.example.nl";
process.env.GOOGLE_CLIENT_ID = "client";
process.env.GOOGLE_CLIENT_SECRET = "geheim";

const g = await import("../src/lib/crm/google");

describe("Google-koppeling", () => {
  it("state is ondertekend en alleen geldig voor dezelfde setter", () => {
    const s = g.maakState("setter-1");
    expect(g.leesState(s)).toBe("setter-1");
    expect(g.leesState(s.replace("setter-1", "setter-2"))).toBeNull();
    expect(g.leesState("rommel")).toBeNull();
    expect(g.leesState(null)).toBeNull();
  });
  it("verlopen state wordt geweigerd", () => {
    vi.useFakeTimers();
    const s = g.maakState("setter-1");
    vi.advanceTimersByTime(16 * 60000);
    expect(g.leesState(s)).toBeNull();
    vi.useRealTimers();
  });
  it("autorisatie-URL vraagt offline toegang tot de agenda", () => {
    const u = new URL(g.autorisatieUrl("setter-1", "m@example.com"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("calendar.events");
    expect(u.searchParams.get("redirect_uri")).toBe("https://sales.example.nl/api/google/callback");
  });
});
