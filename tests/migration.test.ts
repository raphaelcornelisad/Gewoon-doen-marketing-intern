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
