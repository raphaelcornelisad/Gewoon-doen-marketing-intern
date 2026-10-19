import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { AlgemeenForm, GebruikerForm, KnopActie, ScriptForm, TemplateForm } from "@/components/crm/instellingen-forms";
import { formatEuro } from "@/lib/commission";
import { analyseStatus } from "@/lib/crm/analyse";
import { crmSettings } from "@/lib/crm/calendly";
import { regels } from "@/lib/crm/grootboek";
import { instellingenData } from "@/lib/crm/instellingen";
import { requireCrmUser } from "@/lib/crm/server";
import { twilioStatus } from "@/lib/crm/twilio";
import { env } from "@/lib/env";
import { wanneer } from "../format";

export const metadata: Metadata = { title: "Instellingen · CRM" };
export const dynamic = "force-dynamic";

function Status({ aan, tekst }: { aan: boolean; tekst: string }) {
  return (
    <li>
      <span className={`crm-chip${aan ? " crm-chip--ok" : " crm-chip--wacht"}`}>{aan ? "Werkt" : "Wacht op aansluiting"}</span> {tekst}
    </li>
  );
}

export default async function Instellingen() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  const [s, data, r] = await Promise.all([crmSettings(), instellingenData(), regels()]);
  const tw = twilioStatus();
  const an = analyseStatus();
  const base = env("APP_URL").replace(/\/$/, "");
  const calendlyToken = !!process.env.CALENDLY_TOKEN;
  const { calendly_signing_key: _k, calendly_webhook_uri: _w, laatste_sync: _l, laatste_sync_fout: _f, commissie_grondslag: _c, ...bewerkbaar } = s;
  void _k; void _w; void _l; void _f; void _c;

  return (
    <>
      <CrmBar user={user} actief="/crm/instellingen" />
      <h1>Instellingen</h1>

      <section className="card crm-form">
        <h2>Integraties</h2>
        <ul className="crm-statuslijst">
          <Status aan={calendlyToken} tekst="Calendly API (CALENDLY_TOKEN in Vercel)" />
          <Status aan={!!s.calendly_webhook_uri} tekst={`Calendly-webhook (boekingen, annuleringen, verplaatsingen, no-shows) → ${base}/api/webhooks/calendly`} />
          <Status aan={!!s.calendly_url_kennismaking && !!s.calendly_url_sales} tekst="Calendly-links per gesprekstype" />
          <Status aan={tw.voice} tekst="Bellen in de browser + opnames (Twilio Voice: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID, TWILIO_CALLER_ID)" />
          <Status aan={tw.sms} tekst="Sms (TWILIO_SMS_FROM)" />
          <Status aan={tw.whatsapp} tekst="WhatsApp Business Platform via Twilio (TWILIO_WHATSAPP_FROM + goedgekeurde templates)" />
          <Status aan={an.transcriptie} tekst="Transcriptie (DEEPGRAM_API_KEY)" />
          <Status aan={an.analyse} tekst="Gespreksanalyse en bezwaren (ANTHROPIC_API_KEY)" />
          <li><span className="crm-chip crm-chip--wacht">Later</span> Google Agenda (alleen gekoppelde CRM-afspraken)</li>
          <li><span className="crm-chip crm-chip--wacht">Via CSV</span> Leadverzameling: Outscraper/Apify-export importeren</li>
        </ul>
        <details>
          <summary className="small">In Twilio in te stellen</summary>
          <ul className="small">
            <li>TwiML App → Voice Request URL: <code>{base}/api/twilio/voice</code> (POST)</li>
            <li>Nummer/WhatsApp-afzender → “A message comes in”: <code>{base}/api/twilio/inkomend</code> (POST)</li>
            <li>Statusmeldingen van berichten en oproepen stelt het CRM zelf per verzending in.</li>
          </ul>
        </details>
        <div className="inline-form__row">
          <KnopActie soort="webhook" label={s.calendly_webhook_uri ? "Calendly-webhook opnieuw aanmaken" : "Calendly-webhook aanzetten"} />
          <KnopActie url="/api/crm/sync" label="Nu synchroniseren met Calendly" />
        </div>
        <span className="small muted">
          Laatste succesvolle synchronisatie: {s.laatste_sync ? wanneer(s.laatste_sync) : "nog nooit"}
          {s.laatste_sync_fout && <> · <span className="field-error">laatste fout: {s.laatste_sync_fout}</span></>}
        </span>
      </section>

      <section className="card">
        <h2>Calendly, bellen en opnames</h2>
        <AlgemeenForm s={bewerkbaar as Record<string, string | number | boolean | null>} />
      </section>

      <section className="card crm-form">
        <h2>Commissieregels</h2>
        <p style={{ margin: 0 }}>
          Basis {formatEuro(r.basisCents)} per periode · show {formatEuro(r.showCents)} per verschenen kennismaking (één keer per lead) · bonus {formatEuro(r.bonusCents)} bij {r.bonusDrempel} shows in een periode (één keer) · close {r.closePercentage}% van de {s.commissie_grondslag}, verdiend bij Geaccepteerd.
        </p>
        <span className="small muted">Periodes lopen van de 14e tot de 14e (Europe/Amsterdam). Elke regel in het grootboek bewaart de toegepaste versie.</span>
      </section>

      <section className="crm-form">
        <h2>Belscripts</h2>
        {(data.scripts as Parameters<typeof ScriptForm>[0]["script"][]).map((x) => <ScriptForm key={x!.id} script={x} />)}
        <details><summary>Nieuw script</summary><ScriptForm /></details>
      </section>

      <section className="crm-form">
        <h2>Berichttemplates</h2>
        {(data.templates as Parameters<typeof TemplateForm>[0]["tpl"][]).map((x) => <TemplateForm key={x!.id} tpl={x} />)}
        <details><summary>Nieuwe template</summary><TemplateForm /></details>
      </section>

      <section className="crm-form">
        <h2>Gebruikers</h2>
        <p className="small muted" style={{ margin: 0 }}>Setters en salesmedewerkers loggen in via {base}/acquisitie/login met hun e-mailadres.</p>
        {(data.gebruikers as Parameters<typeof GebruikerForm>[0]["g"][]).map((x) => <GebruikerForm key={x!.id} g={x} />)}
        <details><summary>Nieuwe gebruiker</summary><GebruikerForm /></details>
      </section>

      <section className="card">
        <h2>Mislukte synchronisaties</h2>
        {data.mislukt.length === 0 ? (
          <p className="muted">Geen.</p>
        ) : (
          <>
            <table className="table">
              <thead><tr><th>Ontvangen</th><th>Bron</th><th>Soort</th><th>Pogingen</th><th>Fout</th></tr></thead>
              <tbody>
                {(data.mislukt as { id: string; bron: string; soort: string; fout: string; pogingen: number; created_at: string }[]).map((m) => (
                  <tr key={m.id}><td>{wanneer(m.created_at)}</td><td>{m.bron}</td><td>{m.soort}</td><td className="num">{m.pogingen}</td><td className="small">{m.fout}</td></tr>
                ))}
              </tbody>
            </table>
            <KnopActie url="/api/crm/sync" label="Opnieuw verwerken" />
          </>
        )}
      </section>
    </>
  );
}
