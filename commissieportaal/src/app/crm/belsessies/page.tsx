import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { acqSetters } from "@/lib/acquisitie/server";
import { requireBeheer } from "@/lib/auth/beheer";
import { requireCrmUser } from "@/lib/crm/server";
import { sessiesTussen } from "@/lib/crm/sessies";

export const metadata: Metadata = { title: "Belsessies · CRM" };
export const dynamic = "force-dynamic";

const TZ = "Europe/Amsterdam";
const dagVan = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const klok = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const duur = (sec: number) => `${Math.floor(sec / 3600)}u ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}m`;
const plus = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Kalender met ingediende belsessies; klik op een dag voor de cijfers per setter. */
export default async function Belsessies({ searchParams }: { searchParams: Promise<{ maand?: string; dag?: string }> }) {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/belsessies");
  const sp = await searchParams;
  const vandaag = dagVan(new Date().toISOString());
  const maand = /^\d{4}-\d{2}$/.test(sp.maand ?? "") ? sp.maand! : (sp.dag ?? vandaag).slice(0, 7);
  const eerste = `${maand}-01`;
  const volgende = plus(eerste, 32).slice(0, 7);
  const vorige = plus(eerste, -1).slice(0, 7);
  const [sessies, setters] = await Promise.all([sessiesTussen(eerste, `${volgende}-01`), acqSetters()]);
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const perDag = new Map<string, typeof sessies>();
  for (const s of sessies) perDag.set(dagVan(s.gestart_op), [...(perDag.get(dagVan(s.gestart_op)) ?? []), s]);
  const dag = sp.dag && /^\d{4}-\d{2}-\d{2}$/.test(sp.dag) ? sp.dag : perDag.has(vandaag) ? vandaag : null;

  // Kalender: maandag als eerste dag.
  const start = new Date(`${eerste}T12:00:00Z`);
  const leeg = (start.getUTCDay() + 6) % 7;
  const dagen = Number(plus(`${volgende}-01`, -1).slice(8));
  const vakjes = [...Array(leeg).fill(null), ...Array.from({ length: dagen }, (_, i) => `${maand}-${String(i + 1).padStart(2, "0")}`)];
  const titel = start.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });

  const vanDag = dag ? (perDag.get(dag) ?? []) : [];
  const perSetter = new Map<string, typeof vanDag>();
  for (const s of vanDag) perSetter.set(s.setter_id, [...(perSetter.get(s.setter_id) ?? []), s]);
  const som = (l: typeof vanDag) => l.reduce((t, s) => ({ sec: t.sec + s.actief_sec, gebeld: t.gebeld + s.tellers.gebeld, gesproken: t.gesproken + s.tellers.gesproken, wafu: t.wafu + s.tellers.wafu, ingepland: t.ingepland + s.tellers.ingepland }), { sec: 0, gebeld: 0, gesproken: 0, wafu: 0, ingepland: 0 });

  return (
    <>
      <CrmBar user={user} actief="/crm/belsessies" />
      <h1>Belsessies</h1>
      <p className="lead">Elke ingediende belsessie per dag. Klik op een dag om per setter te zien wat er is gebeurd.</p>
      <div className="bs">
        <section className="card bs-kalender">
          <header className="bs-kop">
            <Link href={`/crm/belsessies?maand=${vorige}`} aria-label="Vorige maand">‹</Link>
            <strong>{titel}</strong>
            <Link href={`/crm/belsessies?maand=${volgende}`} aria-label="Volgende maand">›</Link>
          </header>
          <div className="bs-raster">
            {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => <span key={d} className="bs-weekdag">{d}</span>)}
            {vakjes.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const l = perDag.get(d) ?? [];
              const t = som(l);
              return (
                <Link key={d} href={`/crm/belsessies?dag=${d}`} className={`bs-dag${d === dag ? " is-gekozen" : ""}${d === vandaag ? " is-vandaag" : ""}${l.length ? " heeft" : ""}`}>
                  <span className="bs-dag__nr">{Number(d.slice(8))}</span>
                  {l.length > 0 && <span className="bs-dag__info">{t.gebeld} gebeld</span>}
                </Link>
              );
            })}
          </div>
        </section>
        <section className="card bs-detail">
          {!dag ? (
            <p className="muted">Kies een dag in de kalender.</p>
          ) : (
            <>
              <h2>{new Date(`${dag}T12:00:00Z`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</h2>
              {vanDag.length === 0 && <p className="muted">Geen belsessies op deze dag.</p>}
              {[...perSetter.entries()].map(([id, lijst]) => {
                const t = som(lijst);
                return (
                  <div key={id} className="bs-setter">
                    <div className="bs-setter__kop">
                      <strong>{naam.get(id) ?? "Onbekend"}</strong>
                      <span className="small muted">{lijst.length} {lijst.length === 1 ? "sessie" : "sessies"} · {duur(t.sec)} actief</span>
                    </div>
                    <div className="bs-cijfers">
                      <div><span>{t.gebeld}</span>Gebeld</div>
                      <div><span>{t.gesproken}</span>Gesproken</div>
                      <div><span>{t.wafu}</span>WAFU</div>
                      <div><span>{t.ingepland}</span>Ingepland</div>
                      <div><span>{t.gebeld ? Math.round((t.gesproken / t.gebeld) * 100) : 0}%</span>Bereikt</div>
                    </div>
                    <table className="table">
                      <thead><tr><th>Tijd</th><th>Actief</th><th>Gebeld</th><th>Gesproken</th><th>WAFU</th><th>Ingepland</th><th>Opmerking</th></tr></thead>
                      <tbody>
                        {lijst.map((s) => (
                          <tr key={s.id}>
                            <td className="crm-nowrap">{klok(s.gestart_op)}–{s.beeindigd_op ? klok(s.beeindigd_op) : <em>loopt nog</em>}</td>
                            <td className="crm-nowrap">{duur(s.actief_sec)}</td>
                            <td>{s.tellers.gebeld}</td>
                            <td>{s.tellers.gesproken}</td>
                            <td>{s.tellers.wafu}</td>
                            <td>{s.tellers.ingepland}</td>
                            <td className="small">{s.notitie ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </>
          )}
        </section>
      </div>
    </>
  );
}
