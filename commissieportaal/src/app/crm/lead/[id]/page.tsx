import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToestemmingFormKnop } from "@/components/crm/toestemming-knop";
import { CrmBar } from "@/components/crm/crm-bar";
import { Icon, initialen } from "@/components/crm/icons";
import {
  AfspraakKnoppen,
  AnalyseCorrectie,
  categorieLabel,
  EditableContact,
  NietBenaderen,
  NoteForm,
  OpvolgField,
  OwnerField,
  SluitdatumField,
  StatusSelect,
  TaakAfvinken,
  WaardeField,
} from "@/components/crm/lead-actions";
import { BerichtKnop, LeadBalk, TaakKnop } from "@/components/crm/lead-balk";
import { NotitieLijst, type NotitieItem } from "@/components/crm/notities";
import { TagEditor } from "@/components/crm/sheet";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { FASES, faseLabel, type Pijplijn } from "@/lib/crm/core";
import { PROVINCIES } from "@/lib/crm/provincies";
import { allTags, contactDetail, requireCrmUser, type Activity } from "@/lib/crm/server";
import { afspraakTekst, wanneer } from "../../format";

export const metadata: Metadata = { title: "Lead · CRM" };
export const dynamic = "force-dynamic";

const BRON: Record<string, string> = { sheet: "Google Sheet", csv: "CSV-import", calendly: "Calendly", handmatig: "Handmatig" };
const UITKOMST: Record<string, string> = {
  niet_opgenomen: "Niet opgenomen",
  terugbellen: "Terugbellen",
  wafu: "Opvolgen via WhatsApp",
  geinteresseerd: "Geïnteresseerd",
  ingepland: "Ingepland",
  niet_geinteresseerd: "Niet geïnteresseerd",
  ongeldig_nummer: "Ongeldig nummer",
  niet_benaderen: "Niet meer benaderen",
};
const AFSPRAAK: Record<string, string> = { gepland: "Gepland", verplaatst: "Verplaatst", geannuleerd: "Geannuleerd", verschenen: "Verschenen", no_show: "No-show" };
const ATTRIBUTIE: Record<string, string> = { referentie: "boekingsreferentie (CRM)", utm_setter: "persoonlijke Calendly-link", handmatig: "handmatig door admin", geen: "geen setter" };
const BERICHT: Record<string, string> = { wachtrij: "in wachtrij", verzonden: "verzonden", afgeleverd: "afgeleverd", gelezen: "gelezen", mislukt: "mislukt", ontvangen: "ontvangen", handmatig: "handmatig via eigen app (niet gecontroleerd)" };

function regel(a: Activity, naam: Map<string, string>) {
  const wie = a.door === "calendly" ? "Calendly" : a.door === "systeem" ? "Systeem" : a.door === "lead" ? "Lead" : a.setter_id ? (naam.get(a.setter_id) ?? a.door) : "Admin";
  const p = a.pijplijn === "sales" ? "Call geboekt" : "Outbound";
  const wat =
    a.type === "fase"
      ? `${p}: ${a.van ? `${faseLabel(a.pijplijn as Pijplijn, a.van)} → ` : ""}${faseLabel(a.pijplijn as Pijplijn, a.naar ?? "")}${a.tekst ? ` (${a.tekst})` : ""}`
      : a.type === "eigenaar"
        ? `${a.tekst ?? "Eigenaar"}: ${a.van ? (naam.get(a.van) ?? "?") : "niemand"} → ${a.naar ? (naam.get(a.naar) ?? "?") : "niemand"}`
        : (a.tekst ?? a.type);
  return { wie, wat };
}

const TABS = [
  ["details", "Details"],
  ["gesprekken", "Gesprekken"],
  ["berichten", "Berichten"],
  ["afspraken", "Afspraken"],
  ["taken", "Taken"],
  ["notities", "Notities"],
  ["commissie", "Commissie"],
  ["activiteit", "Activiteit"],
] as const;

export default async function Lead({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireCrmUser();
  const { id } = await params;
  const { tab: t } = await searchParams;
  const tab = TABS.some(([k]) => k === t) ? t! : "details";
  const [d, setters, tags] = await Promise.all([contactDetail(id, user), acqSetters(), tab === "details" ? allTags() : Promise.resolve([])]);
  if (!d) notFound();
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const actieveSetters = setters.filter((s) => s.actief && s.rol === "setter").map((s) => ({ id: s.id, naam: s.naam }));
  const verkopers = setters.filter((s) => s.actief && s.rol === "sales").map((s) => ({ id: s.id, naam: s.naam }));
  const tagKeuze = [...actieveSetters, ...verkopers.map((v) => ({ id: v.id, naam: `${v.naam} (geen commissie)` }))];
  const k = d.contact;
  const isAdmin = user.rol === "admin";
  // Losse notities én notities die bij een belpoging zijn vastgelegd, nieuwste boven.
  const notities: NotitieItem[] = [
    ...d.activiteit.filter((a) => a.type === "notitie" && a.tekst).map((a) => ({ id: a.id, tekst: a.tekst!, wie: regel(a, naam).wie, op: a.created_at, bron: undefined as string | undefined })),
    ...d.calls.filter((c) => c.notitie).map((c) => ({ id: `call-${c.id}`, tekst: c.notitie!, wie: c.setter_id ? (naam.get(c.setter_id) ?? c.door) : c.door, op: c.gestart_op, bron: c.uitkomst ? `bij gesprek: ${UITKOMST[c.uitkomst] ?? c.uitkomst}` : "bij gesprek" })),
  ]
    .sort((a, b) => b.op.localeCompare(a.op))
    .map(({ op, ...n }) => ({ ...n, wanneer: wanneer(op) }));
  const openTaken = d.taken.filter((x) => !x.gedaan_op).length;
  const toegeschreven = d.afspraken.find((a) => a.type === "kennismaking" && a.status !== "verplaatst");
  const tel = (n: number) => (n ? ` (${n})` : "");

  return (
    <>
      <CrmBar user={user} actief="" />
      <div className="crm-lead">
        <p style={{ margin: 0 }}>
          <Link href="/crm/outbound">← Leads</Link>
          {d.sales && <> · <Link href="/crm/sales">Call geboekt</Link></>}
        </p>

        <section className="card crm-contactcard">
          <span className="crm-avatar crm-avatar--groot">{initialen(k.salon_naam)}</span>
          <div className="crm-contactcard__info">
            <strong style={{ fontSize: 20 }}>{k.salon_naam}</strong>
            {k.contactpersoon && <span className="muted">{k.contactpersoon}</span>}
            {k.telefoon && <span><Icon name="phone" size={18} /> {k.telefoon}</span>}
            {k.email && <span><Icon name="mail" size={18} /> {k.email}</span>}
            <span className="crm-chips">
              <span className={`crm-label${k.eigenaar_id ? "" : " crm-label--leeg"}`}>{k.eigenaar_id ? `Eigenaar: ${naam.get(k.eigenaar_id) ?? "?"}` : "Niet toegewezen"}</span>
              {d.outbound && <span className="crm-chip">{faseLabel("outbound", d.outbound.fase)}</span>}
              {d.sales && <span className="crm-chip crm-chip--tag">Call geboekt: {faseLabel("sales", d.sales.fase)}</span>}
              {k.tags.map((x) => <span key={x} className="crm-chip crm-chip--tag">{x}</span>)}
            </span>
          </div>
        </section>

        <LeadBalk
          contactId={k.id}
          telefoon={k.telefoon_norm}
          rol={user.rol}
          nietBenaderen={k.niet_benaderen}
          outbound={d.outbound ? { id: d.outbound.id, fase: d.outbound.fase } : null}
          sales={d.sales ? { id: d.sales.id, fase: d.sales.fase } : null}
          magOutbound={d.magOutbound}
          magSales={d.magSales}
          fasesOutbound={FASES.outbound}
          fasesSales={FASES.sales}
          setters={actieveSetters}
          eigenaar={k.eigenaar_id}
          notities={notities}
        />

        <section className="card nt-kaart" aria-label="Notities">
          <div className="nt-kop">
            <strong>{notities.length ? "Laatste notitie" : "Notities"}</strong>
            {notities.length > 1 && <Link href="?tab=notities" scroll={false} replace>Alle {notities.length} notities →</Link>}
          </div>
          <NotitieLijst items={notities.slice(0, 1)} leeg="Nog geen notities. Tik op Notitie om er een toe te voegen." />
        </section>

        {!d.magOutbound && user.rol === "setter" && <div className="notice">Deze lead is van {k.eigenaar_id ? (naam.get(k.eigenaar_id) ?? "een andere setter") : "een andere setter"}. Je kunt meekijken, maar niet aanpassen.</div>}

        <nav className="crm-tabs" aria-label="Onderdelen">
          {TABS.map(([key, label]) => (
            <Link key={key} href={`?tab=${key}`} scroll={false} replace aria-current={tab === key ? "page" : undefined}>
              {label}
              {key === "gesprekken" ? tel(d.calls.length) : key === "berichten" ? tel(d.berichten.length) : key === "afspraken" ? tel(d.afspraken.length) : key === "taken" ? tel(openTaken) : key === "notities" ? tel(notities.length) : ""}
            </Link>
          ))}
        </nav>

        {tab === "details" && (
          <>
            <div className="crm-details">
              <strong>Koude acquisitie</strong>
              {d.outbound && <StatusSelect oppId={d.outbound.id} fase={d.outbound.fase} fases={FASES.outbound.filter((f) => isAdmin || f.key !== "ingepland" || d.outbound!.fase === "ingepland")} disabled={!d.magOutbound} />}
              {isAdmin ? (
                <OwnerField contactId={k.id} value={k.eigenaar_id ?? ""} setters={actieveSetters} label="Huidige verantwoordelijke" soort="eigenaar" />
              ) : (
                <div className="crm-field">Huidige verantwoordelijke<span style={{ fontWeight: 400 }}>{k.eigenaar_id ? naam.get(k.eigenaar_id) : "Nog niemand (na een belpoging wordt de lead van de setter)"}</span></div>
              )}
              <div className="crm-field">Oorspronkelijke setter<span style={{ fontWeight: 400 }}>{k.oorspronkelijke_setter_id ? naam.get(k.oorspronkelijke_setter_id) : "–"}</span></div>
              <OpvolgField contactId={k.id} waarde={k.volgende_opvolging_op} disabled={!d.magOutbound} />
              <div className="crm-field">Belpogingen en laatste contact<span style={{ fontWeight: 400 }}>{k.belpogingen}× gebeld · laatste contact {k.laatste_contact_op ? wanneer(k.laatste_contact_op) : "nog niet"}</span></div>
              <NietBenaderen contactId={k.id} aan={k.niet_benaderen} reden={k.niet_benaderen_reden} disabled={!d.magOutbound && !isAdmin} />
              <div className="crm-field">
                Tags
                {d.magOutbound ? <TagEditor contactId={k.id} tags={k.tags} alle={tags} /> : <span className="crm-chips">{k.tags.map((x) => <span key={x} className="crm-chip crm-chip--tag">{x}</span>)}</span>}
              </div>
              {d.outbound && <WaardeField oppId={d.outbound.id} cents={d.outbound.waarde_cents} disabled={!d.magOutbound} />}
              <div className="crm-field">
                Bron
                <span style={{ fontWeight: 400 }}>
                  {BRON[k.bron] ?? k.bron} · {wanneer(k.created_at)}
                  {k.bron_url && <> · <a href={k.bron_url} target="_blank" rel="noreferrer">bron openen</a></>}
                </span>
              </div>
            </div>

            <div className="crm-details">
              <strong>Call geboekt</strong>
              {d.sales ? (
                <>
                  <span>
                    Fase: <strong>{faseLabel("sales", d.sales.fase)}</strong>
                    {d.sales.offerte_op && <> · offerte {d.sales.offerte_op}{d.sales.offerte_cents ? ` (${formatEuro(d.sales.offerte_cents)})` : ""}</>}
                  </span>
                  <span>
                    Commissie toegeschreven aan: <strong>{d.sales.setter_id ? naam.get(d.sales.setter_id) : "geen setter"}</strong>
                    {toegeschreven && <span className="small muted"> · via {ATTRIBUTIE[toegeschreven.attributie] ?? toegeschreven.attributie}</span>}
                  </span>
                  {isAdmin && (
                    <>
                      <OwnerField contactId={k.id} oppId={d.sales.id} value={d.sales.setter_id ?? ""} setters={tagKeuze} label="Ingepland door (setter)" soort="setter" />
                      <OwnerField contactId={k.id} oppId={d.sales.id} value={d.sales.verkoper_id ?? ""} setters={verkopers} label="Salesmedewerker" soort="verkoper" />
                    </>
                  )}
                  {!isAdmin && d.sales.verkoper_id && <span>Salesmedewerker: {naam.get(d.sales.verkoper_id)}</span>}
                  <WaardeField oppId={d.sales.id} cents={d.sales.waarde_cents} disabled={!d.magSales} />
                  <SluitdatumField oppId={d.sales.id} waarde={d.sales.sluitdatum} disabled={!d.magSales} />
                  <span className="small muted">Dealwaarde is de definitieve contractwaarde excl. btw. Bij Geaccepteerd krijgt de toegeschreven setter 5%.</span>
                </>
              ) : (
                <span className="muted">Nog niet ingepland. Via Calendly (knop hierboven) stroomt de lead door zodra de boeking bevestigd is.</span>
              )}
            </div>

            <section className="card">
              <EditableContact
                contactId={k.id}
                disabled={!d.magOutbound}
                provincies={PROVINCIES}
                initial={{
                  salon_naam: k.salon_naam,
                  contactpersoon: k.contactpersoon ?? "",
                  telefoon: k.telefoon ?? "",
                  email: k.email ?? "",
                  website: k.website ?? "",
                  adres: k.adres ?? "",
                  postcode: k.postcode ?? "",
                  stad: k.stad ?? "",
                  provincie: k.provincie ?? "",
                  type_bedrijf: k.type_bedrijf ?? "",
                  behandelingen: k.behandelingen.join(", "),
                }}
              />
            </section>

            <section className="card crm-form">
              <strong>Toestemming en contactvoorkeuren</strong>
              {d.toestemming.length === 0 ? (
                <span className="small muted">Niets vastgelegd. Een geïmporteerd telefoonnummer is geen WhatsApp-toestemming.</span>
              ) : (
                <ul className="crm-timeline">
                  {d.toestemming.map((c) => (
                    <li key={c.id}>
                      <span className="small muted">{wanneer(c.created_at)} · {c.vastgelegd_door}</span>
                      <div>{c.kanaal} ({c.categorie}): <strong>{c.status}</strong> · {c.bron}</div>
                    </li>
                  ))}
                </ul>
              )}
              <ToestemmingFormKnop contactId={k.id} />
            </section>
          </>
        )}

        {tab === "gesprekken" && (
          <section className="crm-form">
            {d.calls.length === 0 && <p className="muted">Nog geen gesprekken.</p>}
            {d.calls.map((c) => (
              <article key={c.id} className="card crm-form">
                <div className="crm-toolbar">
                  <strong>{c.uitkomst ? UITKOMST[c.uitkomst] ?? c.uitkomst : "Uitkomst nog niet vastgelegd"}</strong>
                  <span className="small muted">{wanneer(c.gestart_op)} · {c.setter_id ? naam.get(c.setter_id) : c.door}</span>
                </div>
                <span className="small">
                  Duur {c.duur_sec ? `${Math.floor(c.duur_sec / 60)}:${String(c.duur_sec % 60).padStart(2, "0")}` : "–"} · Provider: {c.provider === "twilio" ? `Twilio (status: ${c.provider_status ?? "onbekend"})` : "handmatig (geen providerstatus)"}
                </span>
                {c.notitie && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{c.notitie}</p>}
                {c.opname_url && <audio controls preload="none" src={`/api/crm/opname/${c.id}`} style={{ width: "100%" }} />}
                {c.samenvatting && <p style={{ margin: 0 }}><strong>Samenvatting:</strong> {c.samenvatting}</p>}
                {c.vervolgstap && <p style={{ margin: 0 }}><strong>Vervolgstap:</strong> {c.vervolgstap}</p>}
                {!!c.bezwaren?.length && (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {c.bezwaren.map((b, i) => (
                      <li key={i}><strong>{categorieLabel(b.categorie)}</strong> · {Math.floor(b.tijdstip_sec / 60)}:{String(b.tijdstip_sec % 60).padStart(2, "0")} · “{b.citaat}”</li>
                    ))}
                  </ul>
                )}
                {c.analyse_status && <span className="small muted">Analyse: {c.analyse_status}</span>}
                {c.transcript && (
                  <details>
                    <summary className="small">Transcript</summary>
                    <div className="crm-transcript">
                      {c.transcript.map((u, i) => (
                        <span key={i}><span className="muted">{Math.floor(u.start / 60)}:{String(u.start % 60).padStart(2, "0")} {u.spreker}:</span> {u.tekst}</span>
                      ))}
                    </div>
                  </details>
                )}
                {(c.samenvatting || c.bezwaren) && (isAdmin || c.setter_id === user.setter?.id) && <AnalyseCorrectie callId={c.id} samenvatting={c.samenvatting} vervolgstap={c.vervolgstap} bezwaren={c.bezwaren ?? []} />}
              </article>
            ))}
          </section>
        )}

        {tab === "berichten" && (
          <section className="card crm-form">
            <div className="crm-toolbar">
              <strong>WhatsApp en sms</strong>
              {!k.niet_benaderen && <BerichtKnop contactId={k.id} />}
            </div>
            {d.berichten.length === 0 && <p className="muted">Nog geen berichten.</p>}
            <div className="crm-bubbels">
              {d.berichten.map((m) => (
                <div key={m.id} className={`crm-bubbel${m.richting === "uit" ? " crm-bubbel--uit" : ""}`}>
                  {m.tekst}
                  <small>
                    {m.kanaal === "whatsapp" ? "WhatsApp" : "Sms"} · {wanneer(m.created_at)} · {m.richting === "uit" ? (m.setter_id ? naam.get(m.setter_id) : m.door) : "lead"} ·{" "}
                    <span className={m.status === "mislukt" ? "crm-status--mislukt" : undefined}>{BERICHT[m.status] ?? m.status}</span>
                    {m.fout && ` (${m.fout})`}
                  </small>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "afspraken" && (
          <section className="crm-form">
            {d.afspraken.length === 0 && <p className="muted">Nog geen afspraken.</p>}
            {d.afspraken.map((a) => (
              <article key={a.id} className="card crm-form">
                <div className="crm-toolbar">
                  <strong>{a.type === "kennismaking" ? "Kennismakingsgesprek" : "Salesgesprek"} · {afspraakTekst(a.start_op)}</strong>
                  <span className={`crm-chip${a.status === "verschenen" ? " crm-chip--tag" : ""}`}>{AFSPRAAK[a.status]}</span>
                </div>
                <span className="small">
                  Ingepland door: {a.setter_id ? naam.get(a.setter_id) : "geen setter"} ({ATTRIBUTIE[a.attributie] ?? a.attributie}) · bevestiging via {a.bevestiging_via} · herinneringen via {a.herinnering_via}
                  {a.vorige_afspraak_id && " · verplaatste afspraak"}
                  {a.status_door && ` · status door ${a.status_door}`}
                </span>
                {(isAdmin || d.magSales) && user.rol !== "setter" && <AfspraakKnoppen id={a.id} status={a.status} />}
              </article>
            ))}
          </section>
        )}

        {tab === "taken" && (
          <section className="card crm-form">
            <div className="crm-toolbar">
              <strong>Taken</strong>
              <TaakKnop contactId={k.id} />
            </div>
            {d.taken.length === 0 && <p className="muted">Geen taken.</p>}
            {d.taken.map((x) => (
              <div key={x.id} className="crm-toolbar">
                <TaakAfvinken id={x.id} gedaan={!!x.gedaan_op} titel={x.titel} />
                <span className="small muted">{x.vervalt_op ? wanneer(x.vervalt_op) : "geen datum"}{x.toegewezen_aan ? ` · ${naam.get(x.toegewezen_aan)}` : ""}</span>
              </div>
            ))}
          </section>
        )}

        {tab === "notities" && (
          <section className="card crm-form">
            <NoteForm contactId={k.id} />
            <NotitieLijst items={notities} />
          </section>
        )}

        {tab === "commissie" && (
          <section className="card">
            <strong>Commissie op deze lead</strong>
            {d.commissie.length === 0 ? (
              <p className="muted">Nog geen commissieregels{user.rol === "setter" ? " voor jou" : ""}.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Datum</th><th>Setter</th><th>Soort</th><th>Berekening</th><th>Status</th><th className="num">Bedrag</th></tr></thead>
                <tbody>
                  {d.commissie.map((r) => (
                    <tr key={r.id} style={r.status === "vervallen" ? { color: "var(--tekst-zacht)", textDecoration: "line-through" } : undefined}>
                      <td>{r.datum}</td>
                      <td>{naam.get(r.setter_id)}</td>
                      <td>{r.soort}</td>
                      <td className="small">{r.uitleg}</td>
                      <td>{r.status}</td>
                      <td className="num">{formatEuro(r.bedrag_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {tab === "activiteit" && (
          <section className="card">
            <ul className="crm-timeline">
              {d.activiteit.map((a) => {
                const r = regel(a, naam);
                return (
                  <li key={a.id} className={a.type === "notitie" ? "notitie" : undefined}>
                    <span className="small muted">{wanneer(a.created_at)} · {r.wie}</span>
                    <div style={{ whiteSpace: "pre-line" }}>{r.wat}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
