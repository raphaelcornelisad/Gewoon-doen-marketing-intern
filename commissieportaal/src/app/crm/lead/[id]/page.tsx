import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { ContactForm, NoteForm, OwnerSelect, SetterSelect, StageButtons, WaardeForm } from "@/components/crm/lead-actions";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { FASES, faseLabel, type Pijplijn } from "@/lib/crm/core";
import { PROVINCIES } from "@/lib/crm/provincies";
import { contactDetail, requireCrmUser, type Activity } from "@/lib/crm/server";
import { afspraakTekst, wanneer } from "../../format";

export const metadata: Metadata = { title: "Lead · CRM" };
export const dynamic = "force-dynamic";

function regel(a: Activity, naam: Map<string, string>) {
  const wie = a.door === "calendly" ? "Calendly" : a.door === "systeem" ? "Systeem" : a.setter_id ? (naam.get(a.setter_id) ?? a.door) : "Admin";
  const p = a.pijplijn === "sales" ? "Sales" : "Outbound";
  const wat =
    a.type === "fase"
      ? `${p}: ${a.van ? `${faseLabel(a.pijplijn as Pijplijn, a.van)} → ` : ""}${faseLabel(a.pijplijn as Pijplijn, a.naar ?? "")}${a.tekst ? ` (${a.tekst})` : ""}`
      : (a.tekst ?? a.type);
  return { wie, wat };
}

export default async function Lead({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCrmUser();
  const { id } = await params;
  const [d, setters] = await Promise.all([contactDetail(id, user), acqSetters()]);
  if (!d) notFound();
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const k = d.contact;
  const isAdmin = user.rol === "admin";
  const tel = k.telefoon?.replace(/[^\d+]/g, "");
  const wa = tel ? tel.replace(/^\+/, "").replace(/^0(?=\d{9}$)/, "31") : null;

  return (
    <>
      <CrmBar user={user} actief="" />
      <p><Link href="/crm/outbound">← Outbound</Link>{(isAdmin || d.sales) && <> · <Link href="/crm/sales">{isAdmin ? "Sales" : "Mijn ingeplande"}</Link></>}</p>
      <h1>{k.salon_naam}</h1>
      <p className="lead">
        {[k.contactpersoon, k.stad, k.provincie].filter(Boolean).join(" · ") || "Geen extra gegevens"}
        {k.eigenaar_id ? <> · opgepakt door <strong>{naam.get(k.eigenaar_id) ?? "?"}</strong></> : " · nog door niemand opgepakt"}
      </p>
      <div className="inline-form__row">
        {tel && <a className="button button--small" href={`tel:${tel}`}>Bellen {k.telefoon}</a>}
        {wa && <a className="button button--small button--ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {k.email && <a className="button button--small button--ghost" href={`mailto:${k.email}`}>Mailen</a>}
        {k.website && <a className="button button--small button--ghost" href={/^https?:/.test(k.website) ? k.website : `https://${k.website}`} target="_blank" rel="noreferrer">Website</a>}
      </div>
      {!d.magBewerken && <div className="notice">Deze lead is opgepakt door een andere setter. Je kunt hem bekijken, maar niet aanpassen.</div>}

      <div className="crm-grid">
        <section className="card">
          <h2>Outbound</h2>
          {d.outbound ? (
            <div className="crm-form">
              <StageButtons oppId={d.outbound.id} fase={d.outbound.fase} fases={FASES.outbound} disabled={!d.magBewerken} />
              <WaardeForm oppId={d.outbound.id} waarde={d.outbound.waarde_cents ? String(d.outbound.waarde_cents / 100).replace(".", ",") : ""} disabled={!d.magBewerken} />
              <span className="small muted">In deze fase sinds {wanneer(d.outbound.fase_sinds)}</span>
              {isAdmin && <OwnerSelect contactId={k.id} value={k.eigenaar_id ?? ""} setters={setters} />}
            </div>
          ) : (
            <p className="muted">Niet in de outbound-pijplijn.</p>
          )}
        </section>

        <section className="card">
          <h2>Sales</h2>
          {d.sales ? (
            <div className="crm-form">
              {d.sales.afspraak_op && <p style={{ margin: 0 }}>📅 Afspraak: <strong>{afspraakTekst(d.sales.afspraak_op)}</strong></p>}
              <p style={{ margin: 0 }}>
                Ingepland door: <strong>{d.sales.setter_id ? (naam.get(d.sales.setter_id) ?? "?") : "geen setter"}</strong>
              </p>
              {isAdmin ? (
                <>
                  <StageButtons oppId={d.sales.id} fase={d.sales.fase} fases={FASES.sales} disabled={false} />
                  <WaardeForm oppId={d.sales.id} waarde={d.sales.waarde_cents ? String(d.sales.waarde_cents / 100).replace(".", ",") : ""} disabled={false} />
                  <SetterSelect oppId={d.sales.id} value={d.sales.setter_id ?? ""} setters={setters} />
                  <span className="small muted">Gewonnen + waarde + setter-tag = close in de acquisitiecommissie.</span>
                </>
              ) : (
                <p style={{ margin: 0 }}>
                  Status: <strong>{faseLabel("sales", d.sales.fase)}</strong>
                  {d.sales.waarde_cents ? <> · {formatEuro(d.sales.waarde_cents)}</> : null}
                </p>
              )}
            </div>
          ) : (
            <p className="muted">Nog niet ingepland. Zet de lead op Ingepland (of laat hem boeken via Calendly) en hij komt hier vanzelf.</p>
          )}
        </section>

        <section className="card">
          <h2>Gegevens</h2>
          <ContactForm
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
          <p className="small muted">Bron: {k.bron} · toegevoegd {wanneer(k.created_at)}</p>
        </section>

        <section className="card">
          <h2>Notities en tijdlijn</h2>
          <NoteForm contactId={k.id} />
          <ul className="crm-timeline" style={{ marginTop: 14 }}>
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
      </div>
    </>
  );
}
