import { describe, expect, it } from "vitest";
import { acqPeriodFor, amsterdamDate } from "@/lib/acquisitie/period";
import {
  calculateStatement,
  clientKey,
  clientsForSetter,
  DEFAULT_ACQ_SETTINGS,
  groupClients,
  type Meeting,
} from "@/lib/acquisitie/calc";

const NOW = new Date("2026-11-13T12:00:00Z");
let n = 0;
const m = (p: Partial<Meeting>): Meeting => ({
  id: `m${++n}`,
  start: "2026-10-20T10:00:00Z",
  status: "active",
  noShow: false,
  email: "klant@x.nl",
  phone: null,
  naam: "Klant",
  utmSource: "mireille",
  eventName: "Kennismaking",
  ...p,
});
const P1 = { start: "2026-10-12", eind: "2026-11-14" };

describe("acquisitie: klanten", () => {
  it("herkent dezelfde klant aan e-mail (hoofdletters/spaties) of telefoon", () => {
    expect(clientKey({ email: " Klant@X.nl ", phone: null, naam: "" })).toBe(clientKey({ email: "klant@x.nl", phone: null, naam: "" }));
    expect(clientKey({ email: null, phone: "06 12345678", naam: "" })).toBe(clientKey({ email: null, phone: "+31612345678", naam: "" }));
  });

  it("herhaal-, vervolg- en verzette afspraken tellen als één klant", () => {
    const clients = groupClients(
      [m({ start: "2026-10-15T09:00:00Z", status: "canceled" }), m({ start: "2026-10-20T09:00:00Z" }), m({ start: "2026-11-05T09:00:00Z", utmSource: null })],
      NOW,
    );
    expect(clients).toHaveLength(1);
    expect(clients[0].meetings).toHaveLength(3);
    expect(clients[0].verschenenOp).toBe("2026-10-20T09:00:00Z");
  });

  it("no-show telt niet; komt de klant later wel, dan telt die alsnog", () => {
    const [noShow] = groupClients([m({ email: "a@x.nl", noShow: true })], NOW);
    expect(noShow.verschenenOp).toBeNull();
    const [later] = groupClients([m({ email: "b@x.nl", noShow: true, start: "2026-10-14T09:00:00Z" }), m({ email: "b@x.nl", start: "2026-10-28T09:00:00Z" })], NOW);
    expect(later.verschenenOp).toBe("2026-10-28T09:00:00Z");
  });

  it("toekomstige afspraak is nog niet verschenen", () => {
    expect(groupClients([m({ start: "2026-11-20T09:00:00Z" })], NOW)[0].verschenenOp).toBeNull();
  });

  it("klant telt alleen als de eerste boeking ooit via haar UTM liep, vanaf haar startdatum", () => {
    const clients = groupClients(
      [
        m({ email: "bestaand@x.nl", utmSource: null, start: "2026-09-01T09:00:00Z" }),
        m({ email: "bestaand@x.nl", utmSource: "mireille", start: "2026-10-20T09:00:00Z" }),
        m({ email: "ander@x.nl", utmSource: "kelly" }),
        m({ email: "nieuw@x.nl", utmSource: "Mireille" }),
      ],
      NOW,
    );
    expect(clientsForSetter(clients, "mireille", "2026-10-12").map((c) => c.email)).toEqual(["nieuw@x.nl"]);
  });
});

describe("acquisitie: commissie", () => {
  const mk = (aantal: number, start = "2026-10-20T09:00:00Z") =>
    groupClients(Array.from({ length: aantal }, (_, i) => m({ email: `k${i}@x.nl`, start })), NOW);

  it("voorbeeld: 25 verschenen, geen bonus, 2 closes van €3.000 = €1.050", () => {
    const s = calculateStatement(
      mk(25),
      [
        { clientKey: "e:k0@x.nl", bedragCents: 300000, gemarkeerdOp: "2026-11-01T10:00:00Z" },
        { clientKey: "e:k1@x.nl", bedragCents: 300000, gemarkeerdOp: "2026-11-02T10:00:00Z" },
      ],
      P1,
      DEFAULT_ACQ_SETTINGS,
      amsterdamDate,
    );
    expect(s.regels.map((r) => r.bedragCents)).toEqual([50000, 25000, 0, 30000]);
    expect(s.totaalCents).toBe(105000);
  });

  it("bonus €500 één keer bij 30, niet nog eens bij 60", () => {
    expect(calculateStatement(mk(29), [], P1, DEFAULT_ACQ_SETTINGS, amsterdamDate).regels[2].bedragCents).toBe(0);
    expect(calculateStatement(mk(30), [], P1, DEFAULT_ACQ_SETTINGS, amsterdamDate).totaalCents).toBe(50000 + 30000 + 50000);
    expect(calculateStatement(mk(60), [], P1, DEFAULT_ACQ_SETTINGS, amsterdamDate).totaalCents).toBe(50000 + 60000 + 50000);
  });

  it("een klant telt in de periode waarin hij verscheen, niet daarna", () => {
    const clients = mk(3, "2026-11-20T09:00:00Z");
    const later = new Date("2026-12-01T00:00:00Z");
    const regrouped = groupClients(clients.flatMap((c) => c.meetings), later);
    expect(calculateStatement(regrouped, [], P1, DEFAULT_ACQ_SETTINGS, amsterdamDate).verschenen).toHaveLength(0);
    expect(calculateStatement(regrouped, [], { start: "2026-11-14", eind: "2026-12-14" }, DEFAULT_ACQ_SETTINGS, amsterdamDate).verschenen).toHaveLength(3);
  });
});

describe("acquisitie: periodes", () => {
  it.each([
    ["2026-10-12T08:00:00Z", "2026-10-12", "2026-11-14"],
    ["2026-11-13T22:00:00Z", "2026-10-12", "2026-11-14"],
    ["2026-11-14T08:00:00Z", "2026-11-14", "2026-12-14"],
    ["2026-12-20T08:00:00Z", "2026-12-14", "2027-01-14"],
    ["2027-01-05T08:00:00Z", "2026-12-14", "2027-01-14"],
  ])("%s → %s – %s", (d, start, eind) => {
    expect(acqPeriodFor(new Date(d))).toMatchObject({ start, eind });
  });
});
