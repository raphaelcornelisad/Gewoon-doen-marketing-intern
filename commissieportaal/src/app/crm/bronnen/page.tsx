import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { amsterdamMidnight, requireCrmUser } from "@/lib/crm/server";
import { videoBronnen } from "@/lib/video/server";
import { bronLabel, conversie, isPeriode, paginaLabel, PERIODES, periodeVan, type BronRij } from "@/lib/video/track";

export const metadata: Metadata = { title: "Bronnen · CRM" };
export const dynamic = "force-dynamic";

const pct = (r: BronRij) => {
  const c = conversie(r);
  return c === null ? "–" : `${c.toLocaleString("nl-NL")}%`;
};

/** Bronvermelding van de videopagina's: per bron en pagina bezoekers, plays, Calendly-weergaven en boekingen. */
export default async function Bronnen({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireCrmUser();
  const { p } = await searchParams;
  const periode = isPeriode(p) ? p : "7d";
  const rijen = await videoBronnen(periodeVan(periode, new Date(), amsterdamMidnight));
  const totaal = rijen.find((r) => r.source === null);
  // Per bron: subtotaal (page null) en de pagina's; grootste bron eerst.
  const bronnen = [...new Set(rijen.filter((r) => r.source !== null).map((r) => r.source as string))]
    .map((s) => ({ source: s, sub: rijen.find((r) => r.source === s && r.page === null)!, paginas: rijen.filter((r) => r.source === s && r.page !== null) }))
    .sort((a, b) => b.sub.bezoekers - a.sub.bezoekers || a.source.localeCompare(b.source));
  const label = PERIODES.find((x) => x.key === periode)!.label;

  const cellen = (r: BronRij) => (
    <>
      <td className="num">{r.bezoekers}</td>
      <td className="num">{r.plays}</td>
      <td className="num">{r.calendly_views}</td>
      <td className="num">{r.boekingen}</td>
      <td className="num">{pct(r)}</td>
    </>
  );

  return (
    <>
      <CrmBar user={user} actief="/crm/bronnen" />
      <div className="crm-toolbar">
        <div>
          <h1>Bronnen</h1>
          <p className="lead">Wie brengt bezoekers en geboekte gesprekken via de videopagina&apos;s (/video en /video-2)?</p>
        </div>
      </div>
      <nav className="crm-tabs" aria-label="Periode">
        {PERIODES.map((x) => (
          <Link key={x.key} href={`/crm/bronnen?p=${x.key}`} aria-current={x.key === periode ? "page" : undefined}>{x.label}</Link>
        ))}
      </nav>
      <section className="card">
        <h2>Per bron · {label}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Bezoekers, plays en Calendly-weergaven tellen unieke browsers; boekingen tellen unieke Calendly-boekingen. Conversie is boekingen gedeeld door bezoekers.
        </p>
        {bronnen.length === 0 ? (
          <p className="muted">Nog geen bezoekers in deze periode.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Bron</th><th>Pagina</th><th className="num">Bezoekers</th><th className="num">Plays</th><th className="num">Calendly bekeken</th><th className="num">Boekingen</th><th className="num">Conversie</th></tr>
              </thead>
              <tbody>
                {bronnen.map((b) => [
                  <tr key={b.source}>
                    <td><strong>{bronLabel(b.source)}</strong></td>
                    <td className="muted">{b.paginas.length > 1 ? "alle" : b.paginas[0] ? paginaLabel(b.paginas[0].page!) : "–"}</td>
                    {cellen(b.sub)}
                  </tr>,
                  ...(b.paginas.length > 1
                    ? b.paginas.map((r) => (
                        <tr key={`${b.source}-${r.page}`} className="small">
                          <td></td>
                          <td>{paginaLabel(r.page!)}</td>
                          {cellen(r)}
                        </tr>
                      ))
                    : []),
                ])}
                {totaal && (
                  <tr>
                    <td><strong>Totaal</strong></td>
                    <td></td>
                    {cellen(totaal)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
