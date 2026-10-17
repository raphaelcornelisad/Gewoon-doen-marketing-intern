import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveButton, CorrectionForm, OpkomstForm, ResendButton, TestModeToggle } from "@/components/admin/actions";
import { AdminBar } from "@/components/admin/admin-bar";
import { LeadList } from "@/components/admin/lead-list";
import { formatDateTime, STATUS_LABEL } from "@/lib/admin/format";
import { getSubmission, replacedVersions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { countAnswers } from "@/lib/attendance";
import { formatEuro } from "@/lib/commission";
import { CORRECTABLE, effectiveCounts, type Correction } from "@/lib/corrections";
import { checklistsFor, checklistUrl, opkomstInfo, recalc, tabMatches } from "@/lib/opkomst/server";
import type { AppSettings } from "@/lib/settings";
import { db } from "@/lib/supabase/server";
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
  const open = s.status === "te_controleren";
  const [opk, lists, settingsRow, matches] = await Promise.all([
    opkomstInfo(s.setter.id, s.period.start, s.period.id),
    checklistsFor(s.setter.id, s.period.id),
    db().from("settings").select("clinic_mail_test_mode").eq("id", 1).maybeSingle(),
    tabMatches(snap),
  ]);
  const nietHerkend = matches.filter((m) => !m.clinic && m.groen > 0);
  const testmodus = (settingsRow.data as { clinic_mail_test_mode: boolean } | null)?.clinic_mail_test_mode ?? true;
  const settingsJson = (s as unknown as { settings_json: AppSettings }).settings_json;
  const corrections = (s.corrections_json ?? []) as Correction[];
  const origineel = snap.totaal;
  const t = effectiveCounts(origineel, corrections);
  // Zolang de indiening open staat, rekenen we live met de actuele opkomst; daarna geldt het vastgezette bedrag.
  const c = open ? recalc(t, settingsJson, opk.bron === "al_uitbetaald" ? 0 : opk.aantal) : s.commission_json;
  const prevTelling = opk.checklists.reduce(
    (t, l) => {
      const x = countAnswers(l.items_json);
      return { ja: t.ja + x.ja, nee: t.nee + x.nee, open: t.open + x.open };
    },
    { ja: 0, nee: 0, open: 0 },
  );
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
            ? `${aantal} verschenen × ${formatEuro(tarief)}${open ? (opk.bron === "admin" ? " (door jou vastgesteld)" : " (volgens klinieken)") : ""}`
            : opk.bron === "al_uitbetaald"
              ? "al uitbetaald in een eerdere periode"
              : "nog geen opkomst vorige periode";

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
        <h2>Correcties{corrections.length > 0 && <span className="tag tag--nieuw">{corrections.length}</span>}</h2>
        {corrections.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="table">
              <thead>
                <tr><th>Wat</th><th className="num">Origineel</th><th className="num">Was</th><th className="num">Nieuw</th><th>Opmerking</th><th>Wanneer</th></tr>
              </thead>
              <tbody>
                {corrections.map((x, i) => (
                  <tr key={i}>
                    <td>{CORRECTABLE.find((k) => k.key === x.veld)?.label ?? x.veld}</td>
                    <td className="num muted">{origineel[x.veld]}</td>
                    <td className="num">{x.oud}</td>
                    <td className="num strong">{x.nieuw}</td>
                    <td>{x.opmerking}</td>
                    <td className="muted small">{formatDateTime(x.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {open ? (
          <CorrectionForm id={s.id} velden={CORRECTABLE.map((k) => ({ key: k.key, label: k.label, huidig: t[k.key] }))} />
        ) : (
          <p className="muted small">{corrections.length ? "Correcties staan op slot." : "Geen correcties."}</p>
        )}
      </section>

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

      <section className="card">
        <h2>Salon per tab{nietHerkend.length > 0 && <span className="tag tag--nieuw">{nietHerkend.length} niet herkend</span>}</h2>
        <p className="muted small">
          Afspraak voor setters: tabnaam = volledige salonnaam, bij twee behandelingen &quot;Salonnaam - behandeling&quot;.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Tab</th><th>Salon</th><th className="num">Groen</th><th>Herkend via</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.tab}>
                  <td>{m.tab}</td>
                  <td className={m.clinic ? "" : "warn-text"}>{m.clinic?.naam ?? "Niet herkend"}</td>
                  <td className="num">{m.groen}</td>
                  <td className="muted small">{m.via === "naam" ? "salonnaam" : m.via === "koppeling" ? "oude koppeling" : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nietHerkend.length > 0 && (
          <p className="small">Tabs zonder salon krijgen geen afvinklijst. Laat de setter de tab hernoemen en opnieuw indienen.</p>
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

      <section className="card">
        <h2>Opkomstbonus vorige periode</h2>
        {!opk.prev || !opk.attendance ? (
          <p className="muted">Geen goedgekeurde vorige periode voor deze setter, dus geen opkomstbonus.</p>
        ) : (
          <>
            <p className="muted small">
              Periode {opk.prev.label} · {opk.attendance.status === "uitbetaald" ? "uitbetaald, staat op slot" : "telt mee in deze indiening"}
            </p>
            <div className="kv">
              <div><strong>{opk.attendance.max_count}</strong><span>Maximum (groen)</span></div>
              <div><strong>{prevTelling.ja}</strong><span>Verschenen volgens klinieken</span></div>
              <div><strong>{prevTelling.nee}</strong><span>Niet verschenen</span></div>
              <div><strong>{prevTelling.open + Math.max(0, opk.attendance.max_count - prevTelling.ja - prevTelling.nee - prevTelling.open)}</strong><span>Nog open</span></div>
              <div><strong>{opk.aantal}</strong><span>Telt mee ({opk.bron === "admin" ? "vastgesteld door jou" : opk.bron === "klinieken" ? "klinieken" : "–"})</span></div>
            </div>
            <ul className="warns">
              {opk.checklists.map((l) => {
                const t = countAnswers(l.items_json);
                return (
                  <li key={l.id}>
                    <span className={`tag ${l.submitted_at ? "" : "tag--nieuw"}`}>{l.submitted_at ? "Ingediend" : "Open"}</span>
                    <span>{l.clinic.naam}: {t.ja} ja · {t.nee} nee · {t.open} open</span>
                  </li>
                );
              })}
            </ul>
            {open && opk.attendance.status !== "uitbetaald" && (
              <div style={{ marginTop: 12 }}>
                <OpkomstForm attendanceId={opk.attendance.id} max={opk.attendance.max_count} huidig={opk.attendance.approved_count} />
              </div>
            )}
          </>
        )}
      </section>

      {open ? (
        <section className="card">
          <h2>Goedkeuren</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <TestModeToggle aan={testmodus} />
            <ApproveButton id={s.id} bedrag={formatEuro(c.totaalCents)} testmodus={testmodus} />
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Afvinklijsten klinieken</h2>
          {s.approved_at && <p className="muted small">Goedgekeurd op {formatDateTime(s.approved_at)}. Bedrag staat op slot.</p>}
          {lists.length === 0 ? (
            <p className="muted">Geen afvinklijsten (geen groene leads met een gekoppelde kliniek).</p>
          ) : (
            <ul className="warns">
              {lists.map((l) => {
                const t = countAnswers(l.items_json);
                return (
                  <li key={l.id}>
                    <span className="tag">{l.locked ? "Op slot" : l.submitted_at ? "Ingediend" : l.sent_at ? "Verstuurd" : "Niet verstuurd"}</span>
                    <span>
                      <strong>{l.clinic.naam}</strong> · {t.totaal} leads · {t.ja} ja · {t.nee} nee · {t.open} open
                      <br />
                      <span className="small muted">
                        {l.sent_at ? `Verstuurd naar ${l.sent_to} op ${formatDateTime(l.sent_at)}` : "Nog niet verstuurd"}
                        {" · "}
                        <a href={checklistUrl(l.token)} target="_blank" rel="noopener noreferrer">Lijst openen ↗</a>
                        {" · "}
                      </span>
                      {!l.locked && <ResendButton checklistId={l.id} periode={s.period.label} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div style={{ marginTop: 12 }}><TestModeToggle aan={testmodus} /></div>
        </section>
      )}

      <p>
        <Link href="/admin">← Terug naar overzicht</Link>
      </p>
    </>
  );
}
