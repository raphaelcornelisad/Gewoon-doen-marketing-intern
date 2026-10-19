import type { Metadata } from "next";
import Link from "next/link";
import { CommissieActies, Herbereken } from "@/components/crm/commissie-acties";
import { CrmBar } from "@/components/crm/crm-bar";
import { periodsFor } from "@/lib/acquisitie/period";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { crmSettings } from "@/lib/crm/calendly";
import { regelVersie } from "@/lib/crm/commissie";
import { herbereken, ledger, regels, totalen } from "@/lib/crm/grootboek";
import { requireCrmUser } from "@/lib/crm/server";
import { db } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Commissie · CRM" };
export const dynamic = "force-dynamic";

const SOORT: Record<string, string> = { basis: "Basisvergoeding", show: "Showvergoeding", bonus: "Bonus", close: "Closecommissie", correctie: "Correctie", uitbetaling: "Uitbetaling" };

export default async function Commissie({ searchParams }: { searchParams: Promise<{ p?: string; setter?: string }> }) {
  const user = await requireCrmUser();
  const sp = await searchParams;
  await herbereken(user.email).catch((e) => console.error("Herberekenen mislukt", e));
  const [setters, r, s] = await Promise.all([acqSetters(), regels(), crmSettings()]);
  const zichtbaar = setters.filter((x) => x.rol === "setter" && (user.rol === "admin" || x.id === user.setter?.id));
  const gekozen = user.rol === "admin" ? zichtbaar.find((x) => x.id === sp.setter) ?? null : zichtbaar[0] ?? null;
  const periods = periodsFor({ start_datum: gekozen?.start_datum ?? "2026-10-12" });
  const periode = periods.find((x) => x.start === sp.p) ?? periods[0];

  if (user.rol === "sales") {
    return (
      <>
        <CrmBar user={user} actief="/crm/commissie" />
        <p className="muted">Commissie is alleen zichtbaar voor setters en de admin.</p>
      </>
    );
  }

  const rows = gekozen ? await ledger(gekozen.id, periode.start) : [];
  const t = totalen(rows);
  const overzicht =
    user.rol === "admin" && !gekozen
      ? await Promise.all(zichtbaar.map(async (x) => ({ setter: x, t: totalen(await ledger(x.id, periode.start)) })))
      : [];
  const leads = new Map<string, string>();
  const ids = [...new Set(rows.map((x) => x.contact_id).filter(Boolean))] as string[];
  if (ids.length) {
    const { data } = await db().from("crm_contacts").select("id, salon_naam").in("id", ids);
    for (const c of (data ?? []) as { id: string; salon_naam: string }[]) leads.set(c.id, c.salon_naam);
  }

  return (
    <>
      <CrmBar user={user} actief="/crm/commissie" />
      <h1>{user.rol === "admin" ? "Commissie" : "Mijn commissie"}{gekozen && user.rol === "admin" ? ` · ${gekozen.naam}` : ""}</h1>
      <form method="get" className="crm-filters">
        {user.rol === "admin" && (
          <select name="setter" defaultValue={gekozen?.id ?? ""} aria-label="Setter">
            <option value="">Alle setters</option>
            {zichtbaar.map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}
          </select>
        )}
        <select name="p" defaultValue={periode.start} aria-label="Periode">
          {periods.map((x) => <option key={x.start} value={x.start}>{x.label}</option>)}
        </select>
        <button type="submit" className="button button--small">Toon</button>
        {user.rol === "admin" && <Herbereken />}
      </form>
      <section className="card">
        <strong>Commissieregels</strong>
        <p className="small" style={{ margin: "4px 0 0" }}>
          {regelVersie(r)} · periode van de 14e tot de 14e (eerste periode 12 okt – 14 nov) · grondslag closecommissie: <strong>{s.commissie_grondslag}</strong>, verdiend bij “Geaccepteerd”.
          Show = verschenen bij de kennismaking, één keer per lead; verplaatsingen en tweede gesprekken tellen niet extra.
        </p>
      </section>

      {overzicht.length > 0 && (
        <section className="card">
          <h2>{periode.label}</h2>
          <table className="table">
            <thead><tr><th>Setter</th><th className="num">Verdiend</th><th className="num">Goedgekeurd</th><th className="num">Uitbetaald</th><th className="num">Nog goed te keuren</th></tr></thead>
            <tbody>
              {overzicht.map((o) => (
                <tr key={o.setter.id}>
                  <td><Link href={`?setter=${o.setter.id}&p=${periode.start}`}>{o.setter.naam}</Link></td>
                  <td className="num">{formatEuro(o.t.verdiend)}</td>
                  <td className="num">{formatEuro(o.t.goedgekeurd)}</td>
                  <td className="num">{formatEuro(o.t.uitbetaald)}</td>
                  <td className="num">{formatEuro(o.t.open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {gekozen && (
        <>
          <div className="crm-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {[
              ["Verdiend", t.verdiend],
              ["Goedgekeurd", t.goedgekeurd],
              ["Uitbetaald", t.uitbetaald],
            ].map(([l, v]) => (
              <section key={l as string} className="card">
                <span className="small muted">{l}</span>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{formatEuro(v as number)}</div>
              </section>
            ))}
          </div>
          {user.rol === "admin" && <CommissieActies setterId={gekozen.id} periode={periode.start} />}
          <section className="card table-wrap">
            <h2>Regels · {periode.label}</h2>
            {rows.length === 0 ? (
              <p className="muted">Nog geen regels in deze periode.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Datum</th><th>Soort</th><th>Lead</th><th>Berekening</th><th>Status</th><th className="num">Bedrag</th></tr></thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.id} style={x.status === "vervallen" ? { color: "var(--tekst-zacht)", textDecoration: "line-through" } : undefined}>
                      <td>{x.datum}</td>
                      <td>{SOORT[x.soort] ?? x.soort}</td>
                      <td>{x.contact_id ? <Link href={`/crm/lead/${x.contact_id}?tab=commissie`}>{leads.get(x.contact_id) ?? "lead"}</Link> : "–"}</td>
                      <td className="small">{x.uitleg}{x.percentage ? ` · grondslag ${formatEuro(x.grondslag_cents ?? 0)} × ${x.percentage}%` : ""}<br /><span className="muted">{x.regel_versie}</span></td>
                      <td>{x.status}</td>
                      <td className="num">{formatEuro(x.bedrag_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
