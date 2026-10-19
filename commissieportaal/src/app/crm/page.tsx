import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { acqPeriodFor } from "@/lib/acquisitie/period";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { agenda } from "@/lib/crm/agenda";
import { faseLabel } from "@/lib/crm/core";
import { herbereken, ledger, totalen } from "@/lib/crm/grootboek";
import { amsterdamMidnight, filterCards, loadCards, requireCrmUser, stats } from "@/lib/crm/server";
import { db } from "@/lib/supabase/server";
import { afspraakTekst } from "./format";

export const metadata: Metadata = { title: "CRM · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

function Tegel({ label, waarde, href }: { label: string; waarde: string | number; href?: string }) {
  const inhoud = (
    <>
      <span className="small muted">{label}</span>
      <span className="crm-tegel__waarde">{waarde}</span>
    </>
  );
  return href ? <Link href={href} className="card crm-tegel">{inhoud}</Link> : <div className="card crm-tegel">{inhoud}</div>;
}

export default async function Dashboard() {
  const user = await requireCrmUser();
  const periode = acqPeriodFor(new Date());
  const nu = new Date();
  const [cards, sales, komend, st, setters, reviews, inbox] = await Promise.all([
    user.rol === "sales" ? Promise.resolve([]) : loadCards("outbound", user),
    loadCards("sales", user),
    agenda(user, nu.toISOString(), new Date(nu.getTime() + 14 * 86400000).toISOString()),
    user.rol === "sales" ? Promise.resolve(null) : stats(periode.start, periode.eind, user),
    acqSetters(),
    user.rol === "admin" ? db().from("crm_review").select("id", { count: "exact", head: true }).eq("status", "open") : Promise.resolve({ count: 0 }),
    db().from("crm_messages").select("contact_id", { count: "exact", head: true }).eq("richting", "in").eq("gelezen_door_team", false),
  ]);
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const mijn = user.rol === "setter" ? cards.filter((c) => c.contact.eigenaar_id === user.setter.id) : cards;
  const vandaag = filterCards(mijn, { weergave: "vandaag" }, user).length;
  const achter = filterCards(mijn, { weergave: "achterstallig" }, user).length;
  const vrij = cards.filter((c) => !c.contact.eigenaar_id && c.fase === "nieuw" && !c.contact.niet_benaderen).length;
  const { count: taken } = await (user.rol === "admin"
    ? db().from("crm_tasks").select("id", { count: "exact", head: true }).is("gedaan_op", null)
    : db().from("crm_tasks").select("id", { count: "exact", head: true }).is("gedaan_op", null).eq("toegewezen_aan", user.setter.id));
  let commissie = null as null | ReturnType<typeof totalen>;
  if (user.rol === "setter") {
    await herbereken(user.email).catch(() => null);
    commissie = totalen(await ledger(user.setter.id, periode.start));
  }
  const rij = st?.rijen.find((r) => r.setterId === user.setter?.id);

  return (
    <>
      <CrmBar user={user} actief="/crm" open={{ beoordelen: reviews.count ?? 0, inbox: inbox.count ?? 0 }} />
      <div className="crm-toolbar">
        <div>
          <h1>{user.rol === "admin" ? "Dashboard" : `Hoi ${user.setter.naam}`}</h1>
          <p className="lead">Periode {periode.label}</p>
        </div>
        {user.rol === "setter" && <Link href="/crm/bellen" className="button crm-belknop">Start belsessie</Link>}
      </div>

      <div className="crm-tegels">
        {user.rol !== "sales" && <Tegel label={user.rol === "setter" ? "Mijn leads" : "Leads in acquisitie"} waarde={mijn.length} href="/crm/outbound?weergave=mijn" />}
        {user.rol !== "sales" && <Tegel label="Vandaag opvolgen" waarde={vandaag} href="/crm/outbound?weergave=vandaag" />}
        {user.rol !== "sales" && <Tegel label="Achterstallig" waarde={achter} href="/crm/outbound?weergave=achterstallig" />}
        {user.rol !== "sales" && <Tegel label="Nieuw, nog niet toegewezen" waarde={vrij} href="/crm/outbound?weergave=vrij" />}
        <Tegel label="Open taken" waarde={taken ?? 0} />
        <Tegel label="Komende afspraken (14 dagen)" waarde={komend.filter((a) => a.status === "gepland").length} href="/crm/agenda?dagen=31" />
        {rij && (
          <>
            <Tegel label="Belpogingen deze periode" waarde={rij.belpogingen} />
            <Tegel label="Bereikt" waarde={rij.bereikt} />
            <Tegel label="Verschenen kennismakingen" waarde={rij.verschenen} />
            <Tegel label="No-shows / annuleringen" waarde={`${rij.noShow} / ${rij.geannuleerd}`} />
            <Tegel label="Gewonnen deals" waarde={`${rij.gewonnen} · ${formatEuro(rij.gewonnenCents)}`} />
          </>
        )}
        {commissie && (
          <>
            <Tegel label="Verdiende commissie" waarde={formatEuro(commissie.verdiend)} href="/crm/commissie" />
            <Tegel label="Goedgekeurd / uitbetaald" waarde={`${formatEuro(commissie.goedgekeurd)} / ${formatEuro(commissie.uitbetaald)}`} href="/crm/commissie" />
          </>
        )}
        {user.rol === "admin" && <Tegel label="Te beoordelen" waarde={reviews.count ?? 0} href="/crm/beoordelen" />}
        {user.rol !== "sales" && <Tegel label="Ongelezen berichten" waarde={inbox.count ?? 0} href="/crm/inbox" />}
      </div>

      <div className="crm-grid">
        <section className="card">
          <h2>Komende afspraken</h2>
          {komend.length === 0 && <p className="muted">Geen afspraken de komende 14 dagen.</p>}
          <ul className="crm-timeline">
            {komend.filter((a) => a.status === "gepland").slice(0, 12).map((a) => (
              <li key={a.id}>
                <span className="small muted">{afspraakTekst(a.start_op)} · {a.type === "kennismaking" ? "kennismaking" : "salesgesprek"}{user.rol !== "setter" && a.setter_id ? ` · ${naam.get(a.setter_id)}` : ""}</span>
                <div><Link href={`/crm/lead/${a.contact.id}?tab=afspraken`}>{a.contact.salon_naam}</Link></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>{user.rol === "setter" ? "Pijplijnvoortgang van mijn ingeplande leads" : "Sales"}</h2>
          {sales.length === 0 && <p className="muted">Nog geen leads in sales.</p>}
          <ul className="crm-timeline">
            {sales.slice(0, 12).map((c) => (
              <li key={c.id}>
                <span className="small muted">{faseLabel("sales", c.fase)}{c.waarde_cents ? ` · ${formatEuro(c.waarde_cents)}` : ""}</span>
                <div><Link href={`/crm/lead/${c.contact_id}`}>{c.contact.salon_naam}</Link></div>
              </li>
            ))}
          </ul>
          {sales.length > 12 && <Link href="/crm/sales" className="small">Alle {sales.length} bekijken →</Link>}
        </section>
      </div>
      {user.rol === "admin" && st && (
        <section className="card">
          <h2>Setters deze periode</h2>
          <table className="table">
            <thead><tr><th>Setter</th><th className="num">Belpogingen</th><th className="num">Bereikt</th><th className="num">Gepland</th><th className="num">Verschenen</th><th className="num">Gewonnen</th></tr></thead>
            <tbody>
              {st.rijen.map((r) => (
                <tr key={r.setterId}><td>{r.naam}</td><td className="num">{r.belpogingen}</td><td className="num">{r.bereikt}</td><td className="num">{r.gepland}</td><td className="num">{r.verschenen}</td><td className="num">{r.gewonnen}</td></tr>
              ))}
            </tbody>
          </table>
          <Link href="/crm/overzicht" className="small">Alle cijfers →</Link>
        </section>
      )}
      <p className="small muted">Bijgewerkt {new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" })} · periodegrens {new Date(amsterdamMidnight(periode.eind)).toLocaleDateString("nl-NL")}</p>
    </>
  );
}
