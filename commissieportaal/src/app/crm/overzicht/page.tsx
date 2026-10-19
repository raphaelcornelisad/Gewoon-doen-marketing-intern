import type { Metadata } from "next";
import { CrmBar } from "@/components/crm/crm-bar";
import { periodsFor } from "@/lib/acquisitie/period";
import { formatEuro } from "@/lib/commission";
import { requireCrmUser, stats } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Cijfers · CRM" };
export const dynamic = "force-dynamic";

export default async function Overzicht({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireCrmUser();
  const periods = periodsFor({ start_datum: "2026-10-12" });
  const { p } = await searchParams;
  const periode = periods.find((x) => x.start === p) ?? periods[0];
  const s = await stats(periode.start, periode.eind, user);
  const kol: [keyof (typeof s.rijen)[number], string][] = [
    ["opgepakt", "Opgepakt"],
    ["gebeld", "Gebeld"],
    ["wafu", "WAFU"],
    ["opvolgen", "Opvolgen"],
    ["ingepland", "Ingepland"],
    ["verloren", "Verloren"],
    ["gesprek", "Gesprek"],
    ["noShow", "No-show"],
    ["gewonnen", "Gewonnen"],
  ];
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
        <p className="small muted" style={{ marginTop: 0 }}>Aantal unieke leads dat in deze periode naar de fase is gezet. Salesfases tellen voor de setter met de tag.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Setter</th>{kol.map(([, l]) => <th key={l} className="num">{l}</th>)}<th className="num">Waarde gewonnen</th><th className="num">Ingepland → gewonnen</th></tr>
            </thead>
            <tbody>
              {s.rijen.map((r) => (
                <tr key={r.setterId ?? "geen"}>
                  <td>{r.naam}</td>
                  {kol.map(([k]) => <td key={k} className="num">{r[k] as number}</td>)}
                  <td className="num">{formatEuro(r.gewonnenCents)}</td>
                  <td className="num">{r.ingepland ? `${Math.round((r.gewonnen / r.ingepland) * 100)}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="crm-grid">
        {(["outbound", "sales"] as const).filter((x) => s.pijplijn[x].length).map((x) => (
          <section key={x} className="card">
            <h2>Nu in {x === "outbound" ? "Outbound" : "Sales"}</h2>
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
    </>
  );
}
