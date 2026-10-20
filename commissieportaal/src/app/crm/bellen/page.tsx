import type { Metadata } from "next";
import Link from "next/link";
import { BelScherm } from "@/components/crm/belscherm";
import { CrmBar } from "@/components/crm/crm-bar";
import { actiefScript, huidigeReservering } from "@/lib/crm/bellen";
import { crmSettings } from "@/lib/crm/calendly";
import { faseLabel, UITKOMSTEN } from "@/lib/crm/core";
import { contactDetail, requireCrmUser } from "@/lib/crm/server";
import { twilioStatus } from "@/lib/crm/twilio";
import { SessieBalk } from "@/components/crm/sessie-balk";
import { googleAan, koppeling } from "@/lib/crm/google";
import { huidigeSessie } from "@/lib/crm/sessies";

export const metadata: Metadata = { title: "Bellen · CRM" };
export const dynamic = "force-dynamic";

const vul = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => v[k] ?? "");

export default async function Bellen({ searchParams }: { searchParams: Promise<{ lead?: string; sessie?: string; leeg?: string; ingediend?: string }> }) {
  const user = await requireCrmUser();
  const sp = await searchParams;
  if (user.rol !== "setter") {
    return (
      <>
        <CrmBar user={user} actief="/crm/bellen" />
        <h1>Bellen</h1>
        <p className="lead">De belwachtrij is voor setters. Als admin kun je leads bekijken in Outbound.</p>
      </>
    );
  }
  // Verplicht: eerst Google Agenda koppelen, zodat terugbelmomenten in de eigen agenda komen.
  if (googleAan() && !(await koppeling(user.setter.id))) {
    return (
      <>
        <CrmBar user={user} actief="/crm/bellen" />
        <h1>Bellen</h1>
        <section className="sb sb--uit">
          <div>
            <strong>Koppel eerst je Google Agenda</strong>
            <span className="small muted">Dat is verplicht voordat je gaat bellen: elk terugbelmoment dat je plant, komt dan automatisch met een herinnering in je eigen agenda.</span>
          </div>
          <a className="button crm-belknop" href="/api/google/start">Koppel Google Agenda</a>
        </section>
      </>
    );
  }
  const leadId = sp.lead ?? (await huidigeReservering(user));
  const [d, script, s, sessie] = await Promise.all([leadId ? contactDetail(leadId, user) : Promise.resolve(null), actiefScript(), crmSettings(), huidigeSessie(user)]);
  const provider = twilioStatus().voice ? "twilio" : "handmatig";

  if (!d) {
    return (
      <>
        <CrmBar user={user} actief="/crm/bellen" />
        <h1>Bellen</h1>
        <p className="lead">Start een belsessie: het CRM opent steeds de eerstvolgende geschikte lead (achterstallige opvolging eerst, dan je eigen leads, dan nieuwe). Iedere lead wordt tijdens het bellen voor jou gereserveerd.</p>
        {sp.ingediend && <div className="notice">Je belsessie is ingediend. Het overzicht staat bij de admin.</div>}
        {sp.leeg && <div className="notice">Er staan nu geen leads klaar in de wachtrij.</div>}
        <SessieBalk start={sessie} leadId={null} />
        <p className="small muted">
          {provider === "twilio" ? "Bellen gaat via de browser (Twilio)." : "Twilio is nog niet aangesloten: je belt met je eigen telefoon en registreert daarna de uitkomst. Er is dan geen providerstatus of opname."}
          {s.auto_doorbellen ? ` Na elke afronding gaat het CRM na ${s.aftel_sec} seconden automatisch naar de volgende lead (pauzeerbaar).` : ""}
        </p>
      </>
    );
  }

  const k = d.contact;
  const v = { setter: user.setter.naam, salon: k.salon_naam, voornaam: k.contactpersoon?.split(" ")[0] ?? "" };
  const notities = d.activiteit.filter((a) => a.type === "notitie" || a.type === "oproep" || a.type === "bericht").slice(0, 12);
  return (
    <>
      <CrmBar user={user} actief="/crm/bellen" />
      <SessieBalk start={sessie} leadId={k.id} />
      {!d.magOutbound && <div className="alert">Deze lead is van een andere setter.</div>}
      <div className="crm-bel-layout">
        <BelScherm
          key={k.id}
          lead={{
            id: k.id,
            outboundId: d.outbound?.id ?? null,
            salon: k.salon_naam,
            contactpersoon: k.contactpersoon,
            telefoon: k.telefoon,
            telefoonNorm: k.telefoon_norm,
            website: k.website,
            email: k.email,
            plaats: [k.stad, k.provincie].filter(Boolean).join(", "),
            fase: d.outbound ? faseLabel("outbound", d.outbound.fase) : "",
            belpogingen: k.belpogingen,
            nietBenaderen: k.niet_benaderen,
          }}
          uitkomsten={UITKOMSTEN.map((u) => ({ key: u.key, label: u.label }))}
          provider={provider}
          autoDoorbellen={s.auto_doorbellen}
          aftelSec={s.aftel_sec}
          sessie={sp.sessie === "1" || !!sessie}
        />
        <div className="crm-form">
          {script && (
            <section className="card crm-script">
              <strong>Belscript · {script.naam}</strong>
              <h3>Opening</h3>
              <p>{vul(script.opening, v)}</p>
              <h3>Kwalificatie</h3>
              <p>{vul(script.kwalificatie, v)}</p>
              <h3>Pitch</h3>
              <p>{vul(script.pitch, v)}</p>
              <h3>Bezwaren</h3>
              {script.bezwaren.map((b) => (
                <details key={b.bezwaar}>
                  <summary>{b.bezwaar}</summary>
                  <p>{vul(b.antwoord, v)}</p>
                </details>
              ))}
              <h3>Afsluiting</h3>
              <p>{vul(script.afsluiting, v)}</p>
            </section>
          )}
          <section className="card">
            <strong>Eerdere contactmomenten</strong>
            {notities.length === 0 && <p className="muted small">Nog geen contact gehad.</p>}
            <ul className="crm-timeline" style={{ marginTop: 8 }}>
              {notities.map((a) => (
                <li key={a.id} className={a.type === "notitie" ? "notitie" : undefined}>
                  <span className="small muted">{new Date(a.created_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <div style={{ whiteSpace: "pre-line" }}>{a.tekst}</div>
                </li>
              ))}
            </ul>
            <p className="small"><Link href={`/crm/lead/${k.id}`}>Alles bekijken →</Link></p>
          </section>
        </div>
      </div>
    </>
  );
}
