import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { beforeAll, describe, expect, it } from "vitest";

const SQL = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0001_init.sql"), "utf8");

// Supabase-rollen bestaan niet in een kale Postgres.
const ROLES = `create role anon; create role authenticated; create role service_role;`;

describe("migratie 0001_init", () => {
  let db: PGlite;
  let setter: string;
  let period: string;

  const submit = async () =>
    (
      await db.query<{ r: { result: string; id: string } }>(
        `select submit_snapshot($1, $2, 'url', 'sid', 'titel', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) as r`,
        [setter, period],
      )
    ).rows[0].r;

  beforeAll(async () => {
    db = new PGlite({ extensions: { citext } });
    await db.exec(ROLES);
    await db.exec(SQL);
    setter = (await db.query<{ id: string }>(`insert into setters (naam, email) values ('Sanne', 'Sanne@x.nl') returning id`)).rows[0].id;
    period = (
      await db.query<{ id: string }>(`insert into periods (start, eind, label) values ('2026-09-14', '2026-10-14', 'x') returning id`)
    ).rows[0].id;
  });

  it("zet RLS aan op alle tabellen", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    expect(r.rows.length).toBe(8);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it("vindt setters hoofdletterongevoelig op e-mail", async () => {
    const r = await db.query(`select id from setters where email = 'sanne@X.NL'`);
    expect(r.rows).toHaveLength(1);
  });

  it("vervangt een open indiening en blokkeert na goedkeuring", async () => {
    const a = await submit();
    expect(a.result).toBe("nieuw");
    const b = await submit();
    expect(b.result).toBe("vervangen");

    const rows = await db.query<{ id: string; status: string; replaced_by: string | null }>(
      `select id, status, replaced_by from submissions order by submitted_at, id`,
    );
    const old = rows.rows.find((x) => x.id === a.id)!;
    expect(old).toMatchObject({ status: "vervangen", replaced_by: b.id });

    await db.query(`update submissions set status = 'goedgekeurd', approved_at = now() where id = $1`, [b.id]);
    const c = await submit();
    expect(c).toMatchObject({ result: "geblokkeerd", id: b.id });
  });

  it("laat de snapshot niet wijzigen", async () => {
    await expect(db.query(`update submissions set snapshot_json = '{"x":1}' where status = 'vervangen'`)).rejects.toThrow(
      /snapshot/,
    );
  });

  it("zet een goedgekeurde indiening op slot", async () => {
    await expect(db.query(`update submissions set corrections_json = '[1]' where status = 'goedgekeurd'`)).rejects.toThrow(
      /goedgekeurde/,
    );
  });

  it("heeft één rij instellingen met de standaardwaarden", async () => {
    const r = await db.query(`select * from settings`);
    expect(r.rows).toEqual([
      expect.objectContaining({ admin_fee_cents: 15000, per_lead_cents: 200, bonus_per_100_cents: 2500, counted_colors: ["groen"] }),
    ]);
  });
});

describe("migratie 0021_instagram", () => {
  let db: PGlite;
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const IG = ["ig_accounts", "ig_threads", "ig_messages", "ig_daily_metrics", "ig_sync_runs"];
  const sync = async (p: unknown) => (await db.query<{ r: Record<string, unknown> }>(`select ig_sync($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r;
  const thread = async (conv: string) =>
    (await db.query<Record<string, unknown>>(`select * from ig_threads where ig_conversation_id = $1`, [conv])).rows[0];

  // Verzonnen testdata; geen echte gesprekken of gebruikersnamen.
  const account = { ig_user_id: "test-account-1", gebruikersnaam: "test.account" };
  const batch = (fase?: string) => ({
    account,
    threads: [
      {
        ig_conversation_id: "conv-a",
        lead_ig_id: "lead-1",
        lead_gebruikersnaam: "salon.verzonnen",
        gestart_door: "wij",
        ...(fase ? { fase, fase_bron: "script" } : {}),
        messages: [
          { ig_message_id: "m1", van: "wij", verzonden_op: "2026-10-30T09:00:00Z", tekst: "Hoi! Opener." },
          { ig_message_id: "m2", van: "lead", verzonden_op: "2026-10-30T10:00:00Z", tekst: "Afwezig tot maandag", is_autoreply: true },
          { ig_message_id: "m3", van: "lead", verzonden_op: "2026-10-30T11:00:00Z", tekst: "Vertel eens meer" },
        ],
      },
    ],
    metrics: [{ rapportdag: "2026-10-31", nieuwe_gesprekken: 3, signaal_sterk: null }],
  });

  beforeAll(async () => {
    db = new PGlite({ extensions: { citext } });
    await db.exec(ROLES);
    // Zoals Supabase: service_role omzeilt RLS, en standaardrechten voor anon/authenticated op nieuwe tabellen en functies.
    await db.exec(`alter role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      grant usage on schema public to anon, authenticated, service_role;`);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  });

  it("maakt de vijf ig_-tabellen met RLS aan en zonder policies", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'ig\\_%'`,
    );
    expect(r.rows.map((x) => x.relname).sort()).toEqual([...IG].sort());
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
    const p = await db.query(`select * from pg_policies where tablename like 'ig\\_%'`);
    expect(p.rows).toHaveLength(0);
  });

  it("laat anon en authenticated niets lezen of de sync aanroepen", async () => {
    await sync(batch());
    for (const rol of ["anon", "authenticated"]) {
      for (const t of IG) {
        await db.exec(`set role ${rol}`);
        try {
          await expect(db.query(`select * from ${t}`)).rejects.toThrow(/permission denied/);
        } finally {
          await db.exec(`reset role`);
        }
      }
      await db.exec(`set role ${rol}`);
      try {
        await expect(db.query(`select ig_sync('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec(`reset role`);
      }
    }
  });

  it("laat service_role wel lezen", async () => {
    await db.exec(`set role service_role`);
    try {
      const r = await db.query(`select id from ig_threads`);
      expect(r.rows.length).toBeGreaterThan(0);
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("controleert de fase en fase_bron", async () => {
    const acc = (await db.query<{ id: string }>(`select id from ig_accounts limit 1`)).rows[0].id;
    await expect(db.query(`insert into ig_threads (account_id, ig_conversation_id, fase) values ($1, 'x1', 'nieuw')`, [acc])).rejects.toThrow(/check/);
    await expect(db.query(`insert into ig_threads (account_id, ig_conversation_id, fase_bron) values ($1, 'x2', 'gok')`, [acc])).rejects.toThrow(/check/);
    for (const f of ["opener_gestuurd", "in_gesprek", "video_gestuurd", "bookinglink_gestuurd", "call_geboekt", "geen_interesse", "niet_bruikbaar", "intern", "spam"]) {
      await db.query(`insert into ig_threads (account_id, ig_conversation_id, fase) values ($1, $2, $3)`, [acc, `f-${f}`, f]);
    }
    await db.query(`delete from ig_threads where ig_conversation_id like 'f-%'`);
  });

  it("is idempotent: dezelfde batch twee keer geeft geen dubbele rijen", async () => {
    const tweede = await sync(batch());
    expect(tweede.berichten_nieuw).toBe(0);
    expect((await db.query(`select 1 from ig_threads where ig_conversation_id = 'conv-a'`)).rows).toHaveLength(1);
    expect((await db.query(`select 1 from ig_messages`)).rows).toHaveLength(3);
    expect((await db.query(`select 1 from ig_accounts`)).rows).toHaveLength(1);
    expect((await db.query(`select 1 from ig_daily_metrics`)).rows).toHaveLength(1);
  });

  it("berekent laatste bericht en wacht-op-ons zonder autoreply mee te tellen", async () => {
    const t = await thread("conv-a");
    expect(t.laatste_tekst).toBe("Vertel eens meer");
    expect(t.laatste_van).toBe("lead");
    expect(new Date(t.wacht_op_ons_sinds as string).toISOString()).toBe("2026-10-30T11:00:00.000Z");
    await sync({ account, threads: [{ ig_conversation_id: "conv-a", messages: [{ ig_message_id: "m4", van: "wij", verzonden_op: "2026-10-30T11:20:00Z", tekst: "Hier de video" }] }] });
    const na = await thread("conv-a");
    expect(na.wacht_op_ons_sinds).toBeNull();
    expect(na.laatste_van).toBe("wij");
  });

  it("zet de fase uit de sync, maar overschrijft een handmatige fase nooit", async () => {
    await sync(batch("in_gesprek"));
    expect((await thread("conv-a")).fase).toBe("in_gesprek");
    // Zonder fase in de payload blijft de fase staan.
    await sync(batch());
    expect((await thread("conv-a")).fase).toBe("in_gesprek");
    await db.query(`update ig_threads set fase = 'call_geboekt', fase_bron = 'handmatig' where ig_conversation_id = 'conv-a'`);
    await sync(batch("bookinglink_gestuurd"));
    const t = await thread("conv-a");
    expect(t.fase).toBe("call_geboekt");
    expect(t.fase_bron).toBe("handmatig");
  });

  it("werkt alleen meegestuurde dagcijfers bij; null blijft 'nog niet beoordeeld'", async () => {
    await sync({ account, metrics: [{ rapportdag: "2026-10-31", signaal_sterk: 2, bron: { signaal_sterk: "brein" } }] });
    await sync({ account, metrics: [{ rapportdag: "2026-10-31", nieuwe_gesprekken: 5 }] });
    const r = (await db.query<Record<string, unknown>>(`select * from ig_daily_metrics where rapportdag = '2026-10-31'`)).rows[0];
    expect(r).toMatchObject({ nieuwe_gesprekken: 5, signaal_sterk: 2, geen_interesse: null, bron: { signaal_sterk: "brein" } });
  });
});
