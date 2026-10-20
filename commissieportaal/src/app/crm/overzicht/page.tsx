import { requireBeheer } from "@/lib/auth/beheer";
import type { Metadata } from "next";
import { CrmBar } from "@/components/crm/crm-bar";
import { categorieLabel } from "@/components/crm/lead-actions";
import { periodsFor } from "@/lib/acquisitie/period";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { bezwarenOverzicht } from "@/lib/crm/analyse";
import { amsterdamMidnight, requireCrmUser, stats, type SetterStats } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Cijfers · CRM" };
export const dynamic = "force-dynamic";

const KOL: [keyof SetterStats, string][] = [
  ["toegewezen", "Toegewezen leads"],
  ["belpogingen", "Belpogingen"],
  ["bereikt", "Bereikt"],
  ["opvolgtaken", "Open taken"],
  ["gepland", "Kennismakingen gepland"],
  ["verschenen", "Verschenen"],
  ["noShow", "No-show"],
  ["geannuleerd", "Geannuleerd"],
  ["gewonnen", "Gewonnen deals"],
];

export default async function Overzicht({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireCrmUser();
  if (user.rol === "admin") await requireBeheer("/crm/overzicht");
  const periods = periodsFor({ start_datum: "2026-10-12" });
  const { p } = await searchParams;
  const periode = periods.find((x) => x.start === p) ?? periods[0];
  const [s, bezwaren, setters] = await Promise.all([stats(periode.start, periode.eind, user), user.rol === "admin" ? bezwarenOverzicht(amsterdamMidnight(periode.start)) : null, acqSetters()]);
  const naam = new Map(setters.map((x) => [x.id, x.naam]));
  return (
    <>
      <CrmBar user={user} actief="/crm/overzicht" />
      <h1>{user.rol === "admin" ? "Cijfers" : "Mijn cijfers"}</h1>
      <form method="get" className="crm-filters">
        <select name="p" defaultValue={periode.start} aria-label="Periode">
          {periods.map((x) => <option key={x.start} value={x.start}>{x.label}</option>)}
        </select>
        <button type="submit" className="button button--small">Toon</button>
      </form>
      <section className="card">
        <h2>Per setter · {periode.label}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Belpogingen en bereikt tellen oproepen in de periode; afspraken tellen op de gespreksdatum; gewonnen op de sluitingsdatum.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Setter</th>{KOL.map(([, l]) => <th key={l} className="num">{l}</th>)}<th className="num">Dealwaarde</th><th className="num">Show-rate</th></tr>
            </thead>
            <tbody>
              {s.rijen.map((r) => (
                <tr key={r.setterId}>
                  <td>{r.naam}</td>
                  {KOL.map(([k]) => <td key={k} className="num">{r[k] as number}</td>)}
                  <td className="num">{formatEuro(r.gewonnenCents)}</td>
                  <td className="num">{r.verschenen + r.noShow ? `${Math.round((r.verschenen / (r.verschenen + r.noShow)) * 100)}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="crm-grid">
        {(["outbound", "sales"] as const).map((x) => (
          <section key={x} className="card">
            <h2>Nu in {x === "outbound" ? "koude acquisitie" : "sales"}</h2>
            <table className="table">
              <thead><tr><th>Fase</th><th className="num">Leads</th><th className="num">Waarde</th></tr></thead>
              <tbody>
                {s.pijplijn[x].map((f) => (
                  <tr key={f.fase}><td>{f.label}</td><td className="num">{f.aantal}</td><td className="num">{f.waardeCents ? formatEuro(f.waardeCents) : "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      {bezwaren && (
        <section className="card">
          <h2>Bezwaren uit geanalyseerde gesprekken</h2>
          {bezwaren.gesprekken === 0 ? (
            <p className="muted">Nog geen geanalyseerde gesprekken in deze periode. Dit vult zich zodra Twilio-opnames, Deepgram en de Claude-analyse zijn aangesloten.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Setter</th><th>Bezwaren</th></tr></thead>
              <tbody>
                {Object.entries(bezwaren.perSetter).map(([sid, cats]) => (
                  <tr key={sid}>
                    <td>{naam.get(sid) ?? "Onbekend"}</td>
                    <td>{Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${categorieLabel(c)} ${n}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
