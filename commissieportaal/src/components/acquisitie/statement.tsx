import Link from "next/link";
import type { Client } from "@/lib/acquisitie/calc";
import type { SetterOverview } from "@/lib/acquisitie/server";
import { formatDateTime } from "@/lib/admin/format";
import { formatEuro } from "@/lib/commission";
import { CloseForm } from "./close-form";

function clientStatus(c: Client, now: Date): { label: string; cls: string; datum: string | null } {
  if (c.verschenenOp) return { label: "Verschenen", cls: "pill--goedgekeurd", datum: c.verschenenOp };
  const komend = c.meetings.find((m) => m.status === "active" && new Date(m.start) > now);
  if (komend) return { label: "Ingepland", cls: "pill--te_controleren", datum: komend.start };
  if (c.meetings.some((m) => m.noShow)) return { label: "No-show", cls: "pill--vervangen", datum: c.meetings.find((m) => m.noShow)!.start };
  return { label: "Geannuleerd", cls: "pill--vervangen", datum: null };
}

export function StatementView({
  o,
  admin,
  basePath,
  periods,
}: {
  o: SetterOverview;
  admin: boolean;
  basePath: string;
  periods: { start: string; label: string }[];
}) {
  const now = new Date();
  const s = o.goedgekeurd?.calc_json ?? o.statement;
  const verschenenKeys = new Set(s.verschenen.map((c) => c.key));
  const closes = new Map(o.closes.map((c) => [c.client_key, c]));
  const inPeriode = (iso: string) => {
    const d = iso.slice(0, 10);
    return d >= o.periode.start && d < o.periode.eind;
  };
  const clients = o.clients
    .filter((c) => verschenenKeys.has(c.key) || c.meetings.some((m) => inPeriode(m.start)) || closes.has(c.key))
    .sort((a, b) => b.eersteBoeking.localeCompare(a.eersteBoeking));
  const n = s.verschenen.length;
  const drempel = o.settings.bonusDrempel;

  return (
    <>
      <section className="review-head">
        <span className={`pill ${o.goedgekeurd ? "pill--goedgekeurd" : "pill--te_controleren"}`}>
          {o.goedgekeurd ? "Goedgekeurd" : "Lopende periode"}
        </span>
        <h1>{o.setter.naam}</h1>
        <p>
          Periode <strong>{o.periode.label}</strong>
          {o.laatsteSync && <span className="muted small"> · Calendly bijgewerkt {formatDateTime(o.laatsteSync)}</span>}
        </p>
        {periods.length > 1 && (
          <p className="filter">
            {periods.map((p) => (
              <Link key={p.start} href={`${basePath}?p=${p.start}`} className={`chip ${p.start === o.periode.start ? "chip--on" : ""}`}>
                {p.label}
              </Link>
            ))}
          </p>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>{o.goedgekeurd ? "Commissie" : "Commissie tot nu toe"}</h2>
          <table className="calc">
            <tbody>
              {s.regels.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.label}
                    <span className="muted small block">{r.uitleg}</span>
                  </td>
                  <td className="num">{formatEuro(r.bedragCents)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Totaal</td>
                <td className="num">{formatEuro(s.totaalCents)}</td>
              </tr>
            </tbody>
          </table>
          {o.goedgekeurd && <p className="muted small">Goedgekeurd op {formatDateTime(o.goedgekeurd.approved_at)}. Dit bedrag staat vast.</p>}
        </section>

        <section className="card">
          <h2>Verschenen klanten</h2>
          <div className="kv">
            <div><strong>{n}</strong><span>Verschenen deze periode</span></div>
            <div><strong>{Math.max(0, drempel - n)}</strong><span>Nog tot bonus</span></div>
          </div>
          <div className="progress">
            <div className="progress__track"><div className="progress__fill" style={{ width: `${Math.min(100, (n / drempel) * 100)}%` }} /></div>
            <div className="progress__label">
              <span><strong>{n}</strong> van {drempel}</span>
              <span>{n >= drempel ? "Bonus gehaald" : `Bonus ${formatEuro(o.settings.bonusCents)}`}</span>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Een klant telt één keer, in de periode waarin hij voor het eerst echt verscheen. No-shows en vervolgafspraken tellen niet.
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Klanten ({clients.length})</h2>
        {clients.length === 0 ? (
          <p className="muted">Nog geen klanten in deze periode.</p>
        ) : (
          <ul className="sub-list">
            {clients.map((c) => {
              const st = clientStatus(c, now);
              const close = closes.get(c.key);
              return (
                <li key={c.key} className="acq-client">
                  <div className="sub-card__top">
                    <span className="sub-card__name">
                      {c.naam || "Onbekend"}
                      {verschenenKeys.has(c.key) && <span className="tag tag--nieuw">Telt mee</span>}
                      {close && <span className="tag">Close {formatEuro(close.bedrag_cents)}</span>}
                    </span>
                    <span className={`pill ${st.cls}`}>{st.label}</span>
                  </div>
                  <span className="muted small">
                    {admin && c.email ? `${c.email} · ` : ""}
                    {st.datum ? `${st.label === "Ingepland" ? "Gesprek" : st.label} ${formatDateTime(st.datum)}` : ""}
                    {c.meetings.length > 1 ? ` · ${c.meetings.length} afspraken (telt als 1 klant)` : ""}
                  </span>
                  {admin && !o.goedgekeurd && (
                    <CloseForm setterId={o.setter.id} clientKey={c.key} huidig={close ? close.bedrag_cents / 100 : null} opmerking={close?.opmerking ?? ""} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
