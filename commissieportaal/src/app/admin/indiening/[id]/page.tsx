import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBar } from "@/components/admin/admin-bar";
import { LeadList } from "@/components/admin/lead-list";
import { formatDateTime, STATUS_LABEL } from "@/lib/admin/format";
import { getSubmission, replacedVersions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatEuro } from "@/lib/commission";
import type { Warning } from "@/lib/sheets/types";

export const metadata: Metadata = { title: "Controlepagina · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

const WARNING_LABEL: Record<Warning["type"], string> = {
  telling_wijkt_af: "Eigen telling wijkt af",
  te_veel_pogingen: "Meer dan 4 x",
  kolom_ontbreekt: "Kolom ontbreekt",
  ongekleurd: "Ongekleurd",
};

export default async function Controlepagina({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const s = await getSubmission(id);
  if (!s) notFound();

  const snap = s.snapshot_json;
  const c = s.commission_json;
  const t = snap.totaal;
  const tabs = snap.tabs.filter((x) => !x.overgeslagen);
  const skipped = snap.tabs.filter((x) => x.overgeslagen);
  const important = snap.waarschuwingen.filter((w) => w.type !== "ongekleurd");
  const uncolored = tabs.flatMap((x) => x.rijen.filter((r) => r.kleur === "ongekleurd").map((r) => ({ tab: x.tab, ...r })));
  const earlier = await replacedVersions(s.setter.id, s.period.id);

  const formula = (key: string, aantal: number, tarief: number) =>
    key === "admin"
      ? "vast bedrag"
      : key === "leads"
        ? `${aantal} × ${formatEuro(tarief)} (${c.instellingen.countedColors.join(" + ")})`
        : key === "staffel"
          ? `floor(${c.meetellendeLeads} / 100) = ${aantal} × ${formatEuro(tarief)}`
          : aantal
            ? `${aantal} verschenen × ${formatEuro(tarief)}`
            : "nog geen bevestigde opkomst";

  return (
    <>
      <AdminBar email={admin.email} />

      <section className="review-head">
        <span className={`pill pill--${s.status}`}>{STATUS_LABEL[s.status]}</span>
        <h1>
          {s.setter.naam}
          {s.setter.is_nieuw && <span className="tag tag--nieuw">Nieuwe setter</span>}
        </h1>
        <p className="muted">{s.setter.email}</p>
        <p>
          Periode <strong>{s.period.label}</strong> · Sheet{" "}
          <a href={s.sheet_url} target="_blank" rel="noopener noreferrer">
            {s.sheet_title || "openen"} ↗
          </a>{" "}
          · Ingediend {formatDateTime(s.submitted_at)}
        </p>
        {earlier.length > 0 && (
          <p className="muted small">
            Vervangt {earlier.length} eerdere indiening{earlier.length > 1 ? "en" : ""} (laatste{" "}
            {formatDateTime(earlier[0].submitted_at)}, {formatEuro(earlier[0].commission_json.totaalCents)}).
          </p>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Berekening</h2>
          <table className="calc">
            <tbody>
              {c.regels.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.label}
                    <span className="muted small block mono">{formula(r.key, r.aantal, r.tariefCents)}</span>
                  </td>
                  <td className="num">{formatEuro(r.bedragCents)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Commissie</td>
                <td className="num">{formatEuro(c.totaalCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Totaal leads</h2>
          <div className="color-tiles">
            <div className="tile tile--groen"><strong>{t.groen}</strong><span>Groen · telt mee</span></div>
            <div className="tile tile--geel"><strong>{t.geel}</strong><span>Geel</span></div>
            <div className="tile tile--rood"><strong>{t.rood}</strong><span>Rood</span></div>
            <div className="tile tile--ongekleurd"><strong>{t.ongekleurd}</strong><span>Ongekleurd</span></div>
          </div>
          <p className="split"><span>Contactpogingen (WAFU, max 4 per lead)</span><strong>{t.pogingen}</strong></p>
        </section>
      </div>

      <section className="card">
        <h2>Waarschuwingen</h2>
        {important.length === 0 && uncolored.length === 0 ? (
          <p>Geen waarschuwingen.</p>
        ) : (
          <ul className="warns">
            {important.map((w, i) => (
              <li key={i}>
                <span className={`tag tag--${w.type}`}>{WARNING_LABEL[w.type]}</span>
                <span>
                  <strong>{w.tab}</strong> · {w.bericht.replace(/^Tabblad "[^"]+":\s*/, "")}
                </span>
              </li>
            ))}
            {uncolored.length > 0 && (
              <li>
                <span className="tag tag--ongekleurd">Ongekleurd</span>
                <span>{uncolored.length} rijen zonder herkenbare kleur, zie hieronder.</span>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Telling per tab</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tab</th>
                <th className="num"><span className="dot dot--groen" /> G</th>
                <th className="num"><span className="dot dot--geel" /> Y</th>
                <th className="num"><span className="dot dot--rood" /> R</th>
                <th className="num"><span className="dot dot--ongekleurd" /> Wit</th>
                <th className="num">x</th>
                <th className="num">Eigen telling</th>
              </tr>
            </thead>
            <tbody>
              {tabs.map((x) => {
                const off = x.eigenTelling !== null && x.eigenTelling !== x.counts.groen;
                return (
                  <tr key={x.tab}>
                    <td>{x.tab}</td>
                    <td className="num">{x.counts.groen}</td>
                    <td className="num">{x.counts.geel}</td>
                    <td className="num">{x.counts.rood}</td>
                    <td className="num">{x.counts.ongekleurd}</td>
                    <td className="num">{x.counts.pogingen}</td>
                    <td className={`num ${off ? "warn-text" : ""}`}>{x.eigenTelling ?? "–"}</td>
                  </tr>
                );
              })}
              <tr className="foot">
                <td>Totaal</td>
                <td className="num">{t.groen}</td>
                <td className="num">{t.geel}</td>
                <td className="num">{t.rood}</td>
                <td className="num">{t.ongekleurd}</td>
                <td className="num">{t.pogingen}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {skipped.length > 0 && (
          <p className="muted small">Overgeslagen: {skipped.map((x) => `${x.tab} (${x.reden})`).join(", ")}</p>
        )}
      </section>

      {uncolored.length > 0 && (
        <section className="card">
          <h2>Ongekleurde rijen ({uncolored.length})</h2>
          <p className="muted small">Tellen niet mee. Controleer in de sheet of ze een kleur moeten krijgen.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Tab</th><th className="num">Rij</th><th>Naam</th><th>Kleur in sheet</th></tr>
              </thead>
              <tbody>
                {uncolored.map((r) => (
                  <tr key={`${r.tab}-${r.rij}`}>
                    <td>{r.tab}</td>
                    <td className="num">{r.rij}</td>
                    <td>{r.naam}</td>
                    <td className="muted mono small">{r.hex ?? "geen"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Leadlijst</h2>
        <LeadList tabs={tabs.map((x) => ({ tab: x.tab, rijen: x.rijen.map(({ cellen: _c, ...r }) => r) }))} />
      </section>

      <section className="card muted-card">
        <h2>Nog te bouwen</h2>
        <p className="muted">
          Correcties met opmerking, opkomstbonus vorige periode en de knop Goedkeuren komen in de volgende stap.
        </p>
      </section>

      <p>
        <Link href="/admin">← Terug naar overzicht</Link>
      </p>
    </>
  );
}
