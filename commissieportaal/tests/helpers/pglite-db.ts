import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";

/**
 * Testdatabase: kale PGlite met de Supabase-rollen en alle migraties.
 * Alleen lokaal in het geheugen; raakt nooit een echte database.
 */
export async function testDatabase(): Promise<PGlite> {
  const pg = new PGlite({ extensions: { citext } });
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    alter role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;`);
  const dir = path.join(__dirname, "..", "..", "supabase", "migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  return pg;
}

type Res = { data: unknown; error: { message: string } | null };
const id = (s: string) => `"${s.replace(/"/g, "")}"`;
// PostgREST levert tijden als tekst; PGlite als Date. Gelijktrekken.
const norm = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
const waarde = (v: unknown) => (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v);

/**
 * Minimale nabootsing van de supabase-js query builder bovenop PGlite, net genoeg voor de Instagram-code:
 * select/insert/update/delete met eq, neq, is, in, not(in), gt/gte/lt/lte, order, limit, range, single, maybeSingle en rpc.
 */
class Query implements PromiseLike<Res> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private cols = "*";
  private ret = false;
  private rows: Record<string, unknown>[] = [];
  private where: string[] = [];
  private params: unknown[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private off = 0;
  private een: "single" | "maybe" | null = null;

  constructor(
    private pg: PGlite,
    private table: string,
  ) {}

  private p(v: unknown) {
    this.params.push(waarde(v));
    return `$${this.params.length}`;
  }
  select(cols = "*") {
    if (this.op === "select") this.cols = cols;
    else {
      this.ret = true;
      this.cols = cols;
    }
    return this;
  }
  insert(v: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.rows = Array.isArray(v) ? v : [v];
    return this;
  }
  update(v: Record<string, unknown>) {
    this.op = "update";
    this.rows = [v];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.where.push(`${id(c)} = ${this.p(v)}`);
    return this;
  }
  neq(c: string, v: unknown) {
    this.where.push(`${id(c)} <> ${this.p(v)}`);
    return this;
  }
  gt(c: string, v: unknown) {
    this.where.push(`${id(c)} > ${this.p(v)}`);
    return this;
  }
  gte(c: string, v: unknown) {
    this.where.push(`${id(c)} >= ${this.p(v)}`);
    return this;
  }
  lt(c: string, v: unknown) {
    this.where.push(`${id(c)} < ${this.p(v)}`);
    return this;
  }
  lte(c: string, v: unknown) {
    this.where.push(`${id(c)} <= ${this.p(v)}`);
    return this;
  }
  is(c: string, v: null | boolean) {
    this.where.push(`${id(c)} is ${v === null ? "null" : v ? "true" : "false"}`);
    return this;
  }
  in(c: string, v: unknown[]) {
    this.where.push(v.length ? `${id(c)} in (${v.map((x) => this.p(x)).join(", ")})` : "false");
    return this;
  }
  not(c: string, op: string, v: string) {
    if (op !== "in") throw new Error(`not(${op}) niet nagebootst`);
    const lijst = v.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
    this.where.push(`not (${id(c)} in (${lijst.map((x) => this.p(x)).join(", ")}))`);
    return this;
  }
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push(`${id(c)} ${o.ascending === false ? "desc" : "asc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`);
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(from: number, to: number) {
    this.off = from;
    this.lim = to - from + 1;
    return this;
  }
  single() {
    this.een = "single";
    return this;
  }
  maybeSingle() {
    this.een = "maybe";
    return this;
  }

  private sql(): string {
    const w = this.where.length ? ` where ${this.where.join(" and ")}` : "";
    const terug = this.op === "select" || this.ret ? ` returning ${this.cols}` : "";
    if (this.op === "select") {
      const o = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
      const l = this.lim !== null ? ` limit ${this.lim} offset ${this.off}` : "";
      return `select ${this.cols} from ${id(this.table)}${w}${o}${l}`;
    }
    if (this.op === "delete") return `delete from ${id(this.table)}${w}${terug}`;
    if (this.op === "update") {
      const set = Object.entries(this.rows[0]).map(([k, v]) => `${id(k)} = ${this.p(v)}`);
      return `update ${id(this.table)} set ${set.join(", ")}${w}${terug}`;
    }
    const keys = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
    const vals = this.rows.map((r) => `(${keys.map((k) => (k in r ? this.p(r[k]) : "default")).join(", ")})`);
    return `insert into ${id(this.table)} (${keys.map(id).join(", ")}) values ${vals.join(", ")}${terug}`;
  }

  private async run(): Promise<Res> {
    try {
      const r = await this.pg.query<Record<string, unknown>>(this.sql(), this.params);
      const rows = r.rows.map(norm);
      if (this.op !== "select" && !this.ret) return { data: null, error: null };
      if (this.een === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `verwacht 1 rij, kreeg ${rows.length}` } };
      if (this.een === "maybe") return rows.length > 1 ? { data: null, error: { message: "meer dan 1 rij" } } : { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, fout?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, fout);
  }
}

/** Een object met dezelfde vorm als de supabase-js client (from en rpc). */
export function fakeSupabase(pg: PGlite) {
  return {
    from: (t: string) => new Query(pg, t),
    rpc: async (fn: string, args: Record<string, unknown>): Promise<Res> => {
      const keys = Object.keys(args);
      try {
        const r = await pg.query<{ r: unknown }>(`select ${id(fn)}(${keys.map((k, i) => `${id(k)} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => waarde(args[k])));
        return { data: r.rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}
