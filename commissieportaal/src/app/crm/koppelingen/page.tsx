import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { OntkoppelKnop } from "@/components/crm/google-knoppen";
import { acqSetters } from "@/lib/acquisitie/server";
import { googleAan, koppelingen } from "@/lib/crm/google";
import { getCrmUser } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Koppelingen · CRM" };
export const dynamic = "force-dynamic";

const FOUT: Record<string, string> = {
  "niet-ingesteld": "De Google-koppeling is nog niet ingesteld door de beheerder.",
  ongeldig: "De koppeling kon niet worden bevestigd. Probeer het opnieuw.",
  geweigerd: "Je hebt geen toestemming gegeven bij Google. Probeer het opnieuw en sta de agenda toe.",
  "alleen-setters": "Koppelingen zijn voor setters en salesmedewerkers.",
};

export default async function Koppelingen({ searchParams }: { searchParams: Promise<{ ok?: string; fout?: string; verplicht?: string }> }) {
  const user = await getCrmUser();
  if (!user) redirect("/crm/login");
  const sp = await searchParams;
  const [alle, setters] = await Promise.all([koppelingen(), user.rol === "admin" ? acqSetters() : Promise.resolve([])]);
  const mijn = user.setter ? alle.get(user.setter.id) : undefined;
  return (
    <>
      <CrmBar user={user} actief="/crm/koppelingen" />
      <h1>Koppelingen</h1>
      {sp.verplicht && !mijn && (
        <div className="alert">
          <strong>Koppel eerst je Google Agenda.</strong> Dit is verplicht voordat je het CRM kunt gebruiken: elk terugbelmoment en elke taak die je plant komt dan automatisch met een herinnering in je eigen agenda.
        </div>
      )}
      {sp.ok && <div className="notice">Google Agenda is gekoppeld ✓ Je terugbelmomenten en taken verschijnen nu automatisch in je agenda.</div>}
      {sp.fout && <div className="alert">{FOUT[sp.fout] ?? decodeURIComponent(sp.fout)}</div>}
      {!googleAan() && <div className="alert">De Google-koppeling is nog niet ingesteld (GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET ontbreken).</div>}
      {user.setter && (
        <section className="card crm-koppeling">
          <div>
            <h2>Google Agenda {user.rol === "setter" && <span className="crm-chip crm-chip--tag">verplicht</span>}</h2>
            <p className="small muted">Plan je in het CRM een terugbelmoment of een taak met datum, dan komt die automatisch als afspraak in je eigen Google Agenda, met een herinnering 10 minuten van tevoren. Verplaats of rond je hem af in het CRM, dan wordt de afspraak bijgewerkt of verwijderd.</p>
            {mijn ? (
              <p className="small">✓ Gekoppeld{mijn.email ? ` met ${mijn.email}` : ""}{mijn.fout ? <span className="field-error"> · {mijn.fout}</span> : null}</p>
            ) : (
              <p className="small field-error">Nog niet gekoppeld.</p>
            )}
          </div>
          <div className="crm-koppeling__knoppen">
            <a className="button button--small" href="/api/google/start">{mijn ? (mijn.fout ? "Opnieuw koppelen" : "Ander account koppelen") : "Koppel Google Agenda"}</a>
            {mijn && sp.ok && <a className="button button--small button--ghost" href="/crm/bellen">Naar Bellen →</a>}
            {mijn && <OntkoppelKnop />}
          </div>
        </section>
      )}
      {user.rol === "admin" && (
        <section className="card">
          <h2>Status per gebruiker</h2>
          <table className="table">
            <thead><tr><th>Naam</th><th>Rol</th><th>Google Agenda</th></tr></thead>
            <tbody>
              {setters.filter((s) => s.actief).map((s) => {
                const k = alle.get(s.id);
                return (
                  <tr key={s.id}>
                    <td>{s.naam}</td>
                    <td>{s.rol === "sales" ? "Sales" : "Setter"}</td>
                    <td>{k ? <>✓ Gekoppeld{k.email ? ` (${k.email})` : ""}{k.fout && <span className="field-error"> · {k.fout}</span>}</> : <span className="field-error">Niet gekoppeld</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
