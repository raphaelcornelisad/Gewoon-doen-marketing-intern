import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { Icon, initialen, waLink } from "@/components/crm/icons";
import { ClaimButton, EditableContact, NoteForm, OwnerField, StatusSelect, WaardeField } from "@/components/crm/lead-actions";
import { TagEditor } from "@/components/crm/sheet";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { FASES, faseLabel, type Pijplijn } from "@/lib/crm/core";
import { PROVINCIES } from "@/lib/crm/provincies";
import { allTags, contactDetail, requireCrmUser, type Activity } from "@/lib/crm/server";
import { afspraakTekst, wanneer } from "../../format";

export const metadata: Metadata = { title: "Lead · CRM" };
export const dynamic = "force-dynamic";

const BRON: Record<string, string> = { sheet: "Google Sheet", calendly: "Calendly", handmatig: "Handmatig" };

function regel(a: Activity, naam: Map<string, string>) {
  const wie = a.door === "calendly" ? "Calendly" : a.door === "systeem" ? "Systeem" : a.setter_id ? (naam.get(a.setter_id) ?? a.door) : "Admin";
  const p = a.pijplijn === "sales" ? "Sales" : "Outbound";
  const wat =
    a.type === "fase"
      ? `${p}: ${a.van ? `${faseLabel(a.pijplijn as Pijplijn, a.van)} → ` : ""}${faseLabel(a.pijplijn as Pijplijn, a.naar ?? "")}${a.tekst ? ` (${a.tekst})` : ""}`
      : (a.tekst ?? a.type);
  return { wie, wat };
}

const TABS = [
  ["details", "Details"],
  ["notities", "Notities"],
  ["afspraken", "Afspraken"],
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
  const actieve = setters.filter((s) => s.actief).map((s) => ({ id: s.id, naam: s.naam }));
  const k = d.contact;
  const isAdmin = user.rol === "admin";
  const tel = k.telefoon?.replace(/[^\d+]/g, "");
  const wa = waLink(k.telefoon);
  const notities = d.activiteit.filter((a) => a.type === "notitie");
  const afspraken = d.activiteit.filter((a) => a.type === "calendly" || (a.pijplijn === "sales" && a.type === "fase"));

  return (
    <>
      <CrmBar user={user} actief="" />
      <div className="crm-lead">
        <p style={{ margin: 0 }}>
          <Link href="/crm/outbound">← Outbound</Link>
          {(isAdmin || d.sales) && <> · <Link href="/crm/sales">{isAdmin ? "Sales" : "Mijn ingeplande"}</Link></>}
        </p>

        <section className="card crm-contactcard">
          <span className="crm-avatar crm-avatar--groot">{initialen(k.salon_naam)}</span>
          <div className="crm-contactcard__info">
            <strong style={{ fontSize: 20 }}>{k.salon_naam}</strong>
            {k.contactpersoon && <span className="muted">{k.contactpersoon}</span>}
            {k.telefoon && <span><Icon name="phone" size={18} /> {k.telefoon}</span>}
            {k.email && <span><Icon name="mail" size={18} /> {k.email}</span>}
            {(k.stad || k.provincie) && <span className="muted small">{[k.stad, k.provincie].filter(Boolean).join(", ")}</span>}
          </div>
          <div className="crm-contactcard__actions">
            {tel && <a className="crm-iconbtn crm-iconbtn--rond" href={`tel:${tel}`} aria-label="Bellen" title="Bellen"><Icon name="phone" /></a>}
            {wa && <a className="crm-iconbtn crm-iconbtn--rond" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp"><Icon name="chat" /></a>}
            {k.email && <a className="crm-iconbtn crm-iconbtn--rond" href={`mailto:${k.email}`} aria-label="Mailen" title="Mailen"><Icon name="mail" /></a>}
            {k.website && <a className="crm-iconbtn crm-iconbtn--rond" href={/^https?:/.test(k.website) ? k.website : `https://${k.website}`} target="_blank" rel="noreferrer" aria-label="Website" title="Website"><Icon name="globe" /></a>}
            <Link className="crm-iconbtn crm-iconbtn--rond" href={`?tab=notities`} aria-label="Notities" title="Notities"><Icon name="note" /></Link>
          </div>
        </section>

        {!d.magBewerken && <div className="notice">Deze lead is opgepakt door {k.eigenaar_id ? (naam.get(k.eigenaar_id) ?? "een andere setter") : "een andere setter"}. Je kunt hem bekijken, maar niet aanpassen.</div>}

        <nav className="crm-tabs" aria-label="Onderdelen">
          {TABS.map(([key, label]) => (
            <Link key={key} href={`?tab=${key}`} aria-current={tab === key ? "page" : undefined}>
              {label}
              {key === "notities" && notities.length > 0 ? ` (${notities.length})` : ""}
            </Link>
          ))}
        </nav>

        {tab === "details" && (
          <>
            <div className="crm-details">
              <strong>Outbound</strong>
              {d.outbound && <StatusSelect oppId={d.outbound.id} fase={d.outbound.fase} fases={FASES.outbound} disabled={!d.magBewerken} />}
              {isAdmin ? (
                <OwnerField contactId={k.id} value={k.eigenaar_id ?? ""} setters={actieve} label="Eigenaar" soort="eigenaar" />
              ) : (
                <div className="crm-field">
                  Eigenaar
                  {k.eigenaar_id ? <span style={{ fontWeight: 400 }}>{naam.get(k.eigenaar_id) ?? "?"}</span> : <ClaimButton contactId={k.id} />}
                </div>
              )}
              <div className="crm-field">
                Tags
                {d.magBewerken ? (
                  <TagEditor contactId={k.id} tags={k.tags} alle={tags} />
                ) : (
                  <span className="crm-chips">{k.tags.map((x) => <span key={x} className="crm-chip crm-chip--tag">{x}</span>)}</span>
                )}
              </div>
              {d.outbound && <WaardeField oppId={d.outbound.id} cents={d.outbound.waarde_cents} disabled={!d.magBewerken} />}
              <div className="crm-field">
                Bron
                <span style={{ fontWeight: 400 }}>{BRON[k.bron] ?? k.bron} · toegevoegd {wanneer(k.created_at)}</span>
              </div>
            </div>

            <div className="crm-details">
              <strong>Sales</strong>
              {d.sales ? (
                <>
                  {d.sales.afspraak_op && <span>📅 Afspraak: <strong>{afspraakTekst(d.sales.afspraak_op)}</strong></span>}
                  {isAdmin ? (
                    <>
                      <StatusSelect oppId={d.sales.id} fase={d.sales.fase} fases={FASES.sales} disabled={false} />
                      <OwnerField contactId={k.id} oppId={d.sales.id} value={d.sales.setter_id ?? ""} setters={actieve} label="Ingepland door (setter-tag)" soort="setter" />
                      <WaardeField oppId={d.sales.id} cents={d.sales.waarde_cents} disabled={false} />
                      <span className="small muted">Gewonnen + waarde + setter-tag telt mee in de commissie van de setter.</span>
                    </>
                  ) : (
                    <>
                      <span>Status: <strong>{faseLabel("sales", d.sales.fase)}</strong></span>
                      <span>Ingepland door: <strong>{d.sales.setter_id ? (naam.get(d.sales.setter_id) ?? "?") : "geen"}</strong></span>
                      {d.sales.waarde_cents ? <span>Waarde: <strong>{formatEuro(d.sales.waarde_cents)}</strong></span> : null}
                    </>
                  )}
                </>
              ) : (
                <span className="muted">Nog niet ingepland. Zet de status op Ingepland (of laat de lead boeken via Calendly) en hij komt hier vanzelf.</span>
              )}
            </div>

            <section className="card">
              <EditableContact
                contactId={k.id}
                disabled={!d.magBewerken}
                provincies={PROVINCIES}
                initial={{
                  salon_naam: k.salon_naam,
                  contactpersoon: k.contactpersoon ?? "",
                  telefoon: k.telefoon ?? "",
                  email: k.email ?? "",
                  website: k.website ?? "",
                  stad: k.stad ?? "",
                  provincie: k.provincie ?? "",
                  behandelingen: k.behandelingen.join(", "),
                }}
              />
            </section>
          </>
        )}

        {tab === "notities" && (
          <section className="card crm-form">
            <NoteForm contactId={k.id} />
            {notities.length === 0 && <p className="muted">Nog geen notities.</p>}
            <ul className="crm-timeline">
              {notities.map((a) => (
                <li key={a.id} className="notitie">
                  <span className="small muted">{wanneer(a.created_at)} · {regel(a, naam).wie}</span>
                  <div style={{ whiteSpace: "pre-line" }}>{a.tekst}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "afspraken" && (
          <section className="card crm-form">
            {d.sales?.afspraak_op ? (
              <p style={{ margin: 0 }}><Icon name="calendar" size={18} /> <strong>{afspraakTekst(d.sales.afspraak_op)}</strong> · {faseLabel("sales", d.sales.fase)}</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Geen geplande afspraak.</p>
            )}
            <ul className="crm-timeline">
              {afspraken.map((a) => {
                const r = regel(a, naam);
                return (
                  <li key={a.id}>
                    <span className="small muted">{wanneer(a.created_at)} · {r.wie}</span>
                    <div>{r.wat}</div>
                  </li>
                );
              })}
            </ul>
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
