"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { post, Sheet } from "./sheet";

type Beslissing = { api: { ok: boolean; reden: string | null; modus: string | null }; handmatig: { ok: boolean; reden: string | null }; vensterOpen: boolean };
type Check = { ok: boolean; message?: string; beslissing: Beslissing; templates: { id: string; naam: string; goedgekeurd: boolean }[]; templateId: string | null; tekst: string; telefoon: string | null };

const waUrl = (tel: string, tekst: string) => `https://wa.me/${tel.replace(/^\+/, "")}?text=${encodeURIComponent(tekst)}`;

/** WhatsApp/sms opstellen met kanaalcontrole (toestemming, 24-uursvenster, template). */
export function BerichtVenster({ contactId, kanaal: start = "whatsapp", doel = "wafu", titel, onKlaar, onSluit, extra }: { contactId: string; kanaal?: "whatsapp" | "sms"; doel?: string; titel?: string; onKlaar?: () => void; onSluit: () => void; extra?: React.ReactNode }) {
  const router = useRouter();
  const [kanaal, setKanaal] = useState(start);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [c, setC] = useState<Check | null>(null);
  const [tekst, setTekst] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [toestemming, setToestemming] = useState(false);

  async function laad(tpl: string | null = templateId) {
    const q = new URLSearchParams({ contactId, kanaal, doel, ...(tpl ? { templateId: tpl } : {}) });
    const r = (await fetch(`/api/crm/bericht/check?${q}`).then((x) => x.json()).catch(() => null)) as Check | null;
    setC(r);
    if (r?.ok) {
      setTekst(r.tekst);
      setTemplateId(r.templateId);
    }
  }
  useEffect(() => {
    void laad(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanaal]);

  const b = c?.beslissing;
  const klaar = () => {
    router.refresh();
    onKlaar?.();
  };

  return (
    <Sheet titel={titel ?? (kanaal === "whatsapp" ? "WhatsApp-bericht" : "Sms")} onClose={onSluit}>
      <div className="crm-stages" role="group" aria-label="Kanaal">
        <button type="button" className="crm-stage" aria-pressed={kanaal === "whatsapp"} onClick={() => setKanaal("whatsapp")}>WhatsApp</button>
        <button type="button" className="crm-stage" aria-pressed={kanaal === "sms"} onClick={() => setKanaal("sms")}>Sms</button>
      </div>
      {!c ? (
        <p className="muted">Controleren…</p>
      ) : !c.ok ? (
        <div className="alert">{c.message ?? "Controle mislukt."}</div>
      ) : (
        <div className="crm-form">
          {b && !b.api.ok && !b.handmatig.ok && (
            <div className="alert">
              <strong>Dit kanaal kan nu niet gebruikt worden</strong>
              <span className="small">{b.api.reden}</span>
            </div>
          )}
          {b && !b.api.ok && b.handmatig.ok && <div className="notice"><span className="small">{b.api.reden}</span></div>}
          {b?.vensterOpen && <div className="notice notice--ok"><span className="small">24-uursvenster open: de lead heeft recent een bericht gestuurd, vrije tekst is toegestaan.</span></div>}
          {c.templates.length > 0 && (
            <label>
              Template
              <select
                value={templateId ?? ""}
                onChange={(e) => {
                  setTemplateId(e.target.value || null);
                  void laad(e.target.value || null);
                }}
              >
                {c.templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.naam}{kanaal === "whatsapp" ? (t.goedgekeurd ? " (goedgekeurd)" : " (nog niet goedgekeurd)") : ""}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Bericht
            <textarea rows={5} value={tekst} onChange={(e) => setTekst(e.target.value)} readOnly={b?.api.modus === "template"} />
          </label>
          {b?.api.modus === "template" && <span className="small muted">Buiten het 24-uursvenster gaat de goedgekeurde template ongewijzigd mee.</span>}
          <div className="inline-form__row">
            {b?.api.ok && (
              <button
                type="button"
                className="button button--small"
                disabled={busy || !tekst.trim()}
                onClick={async () => {
                  setBusy(true);
                  const r = await post("/api/crm/bericht", { contactId, kanaal, tekst, templateId });
                  setBusy(false);
                  setMsg({ ok: r.ok, t: r.message ?? (r.ok ? "Verzonden." : "Verzenden mislukt.") });
                  if (r.ok) klaar();
                }}
              >
                Versturen via CRM
              </button>
            )}
            {b?.handmatig.ok && c.telefoon && kanaal === "whatsapp" && (
              <a
                className="button button--small button--ghost"
                href={waUrl(c.telefoon, tekst)}
                target="_blank"
                rel="noreferrer"
                onClick={async () => {
                  const r = await post("/api/crm/bericht", { contactId, kanaal, tekst, handmatig: true });
                  setMsg({ ok: r.ok, t: r.ok ? "Geopend in WhatsApp. Vastgelegd als handmatig (niet als verzonden)." : (r.message ?? "Mislukt.") });
                  if (r.ok) klaar();
                }}
              >
                Open in eigen WhatsApp
              </a>
            )}
            <button type="button" className="linkbutton" onClick={() => setToestemming(!toestemming)}>Toestemming vastleggen</button>
          </div>
          {toestemming && <ToestemmingForm contactId={contactId} kanaal={kanaal} onKlaar={() => { setToestemming(false); void laad(); }} />}
          {msg && <span className={`small ${msg.ok ? "muted" : "field-error"}`}>{msg.t}</span>}
          {extra}
        </div>
      )}
    </Sheet>
  );
}

export function ToestemmingForm({ contactId, kanaal, onKlaar }: { contactId: string; kanaal: string; onKlaar: () => void }) {
  const [bron, setBron] = useState("Mondeling akkoord tijdens telefoongesprek");
  const [status, setStatus] = useState<"gegeven" | "ingetrokken">("gegeven");
  const [fout, setFout] = useState<string | null>(null);
  return (
    <form
      className="crm-form card"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post(`/api/crm/contact/${contactId}/toestemming`, { kanaal, status, bron, categorie: "marketing" });
        if (r.ok) onKlaar();
        else setFout(r.message ?? "Mislukt.");
      }}
    >
      <label>
        {kanaal === "whatsapp" ? "WhatsApp" : kanaal === "sms" ? "Sms" : kanaal}-toestemming
        <select value={status} onChange={(e) => setStatus(e.target.value as "gegeven" | "ingetrokken")}>
          <option value="gegeven">Gegeven</option>
          <option value="ingetrokken">Ingetrokken / afgemeld</option>
        </select>
      </label>
      <label>
        Hoe verkregen (bron)
        <input value={bron} onChange={(e) => setBron(e.target.value)} required />
      </label>
      <span className="small muted">Leg alleen vast wat de lead echt heeft gezegd. Een nummer, gesprek of boeking is op zich geen toestemming.</span>
      <button type="submit" className="button button--small">Vastleggen</button>
      {fout && <span className="small field-error">{fout}</span>}
    </form>
  );
}

/** Inplannen via Calendly: link met boekingsreferentie, wachten op bevestiging door de server. */
export function InplanVenster({ contactId, type: startType = "kennismaking", onBevestigd, onSluit }: { contactId: string; type?: "kennismaking" | "salesgesprek"; onBevestigd?: (wanneer: string) => void; onSluit: () => void }) {
  const router = useRouter();
  const [type, setType] = useState(startType);
  const [link, setLink] = useState<{ url: string; ref: string } | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [status, setStatus] = useState<{ bevestigd: boolean; afspraak?: { start_op: string } | null } | null>(null);
  const sinds = useRef(0);
  const [lang, setLang] = useState(false);

  async function open() {
    setFout(null);
    const r = await post("/api/crm/boeking", { contactId, type });
    if (!r.ok) return setFout(r.message ?? "Kon de boekingslink niet maken.");
    setLink({ url: r.data.url, ref: r.data.ref });
    sinds.current = Date.now();
  }

  useEffect(() => {
    if (!link || status?.bevestigd) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/crm/boeking/${link.ref}`).then((x) => x.json()).catch(() => null);
      if (r?.ok) setStatus(r);
      if (r?.bevestigd) {
        router.refresh();
        onBevestigd?.(r.afspraak.start_op);
      }
      if (Date.now() - sinds.current > 180000) setLang(true);
    }, 3000);
    return () => clearInterval(t);
  }, [link, status?.bevestigd, router, onBevestigd]);

  const embed = link ? `${link.url}&embed_domain=${typeof window !== "undefined" ? window.location.host : ""}&embed_type=Inline&hide_gdpr_banner=1` : null;
  return (
    <Sheet titel="Inplannen via Calendly" onClose={onSluit}>
      {!link ? (
        <div className="crm-form">
          <div className="crm-stages" role="group" aria-label="Gesprekstype">
            <button type="button" className="crm-stage" aria-pressed={type === "kennismaking"} onClick={() => setType("kennismaking")}>Kennismakingsgesprek</button>
            <button type="button" className="crm-stage" aria-pressed={type === "salesgesprek"} onClick={() => setType("salesgesprek")}>Salesgesprek</button>
          </div>
          <button type="button" className="button button--small crm-groen" onClick={open}>Open Calendly</button>
          {fout && <div className="alert"><span className="small">{fout}</span></div>}
          <span className="small muted">Naam, e-mail en telefoon worden vooraf ingevuld als ze bekend zijn. De afspraak telt pas als Calendly de boeking bevestigt.</span>
        </div>
      ) : status?.bevestigd ? (
        <div className="notice notice--ok">
          <strong>Boeking bevestigd</strong>
          <span className="small">
            {new Date(status.afspraak!.start_op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · de lead staat nu in sales en in je agenda.
          </span>
          <button type="button" className="button button--small" onClick={onSluit}>Sluiten</button>
        </div>
      ) : (
        <div className="crm-form">
          <iframe src={embed!} title="Calendly" className="crm-calendly" />
          <div className="notice"><span className="small">Boeking wordt bevestigd zodra Calendly die doorgeeft…</span></div>
          {lang && <div className="alert"><span className="small">Nog geen bevestiging van Calendly ontvangen. Is de boeking afgerond? Controleer anders de Calendly-koppeling in Instellingen.</span></div>}
          <a className="small" href={link.url} target="_blank" rel="noreferrer">Calendly in een nieuw tabblad openen</a>
        </div>
      )}
    </Sheet>
  );
}

export function TaakVenster({ contactId, onSluit }: { contactId: string; onSluit: () => void }) {
  const router = useRouter();
  const [titel, setTitel] = useState("");
  const [op, setOp] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  return (
    <Sheet titel="Taak toevoegen" onClose={onSluit}>
      <form
        className="crm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await post(`/api/crm/contact/${contactId}/taak`, { titel, vervaltOp: op ? new Date(op).toISOString() : null });
          if (!r.ok) return setFout(r.message ?? "Mislukt.");
          router.refresh();
          onSluit();
        }}
      >
        <label>Taak<input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Bv. offerte nabellen" required autoFocus /></label>
        <label>Wanneer<input type="datetime-local" value={op} onChange={(e) => setOp(e.target.value)} /></label>
        <button type="submit" className="button button--small">Toevoegen</button>
        {fout && <span className="small field-error">{fout}</span>}
      </form>
    </Sheet>
  );
}

/** Fase kiezen; voor Offerte en Geaccepteerd worden de verplichte velden gevraagd. */
export function FaseVenster({ oppId, fase, fases, pijplijn, onSluit }: { oppId: string; fase: string; fases: { key: string; label: string }[]; pijplijn: "outbound" | "sales"; onSluit: () => void }) {
  const router = useRouter();
  const [keuze, setKeuze] = useState<string | null>(null);
  const [v, setV] = useState({ waarde: "", sluitdatum: new Date().toISOString().slice(0, 10), offerte: "", offerte_op: new Date().toISOString().slice(0, 10) });
  const [fout, setFout] = useState<string | null>(null);
  async function zet(f: string, extra: Record<string, unknown> = {}) {
    const r = await post(`/api/crm/opp/${oppId}`, { fase: f, ...extra });
    if (!r.ok) return setFout(r.message ?? "Mislukt.");
    router.refresh();
    onSluit();
  }
  return (
    <Sheet titel="Fase wijzigen" onClose={onSluit}>
      <div className="crm-sheet__list">
        {fases.map((f) => (
          <button
            key={f.key}
            type="button"
            className="crm-stage"
            aria-pressed={(keuze ?? fase) === f.key}
            onClick={() => (pijplijn === "sales" && (f.key === "offerte" || f.key === "geaccepteerd") ? setKeuze(f.key) : zet(f.key))}
          >
            {f.label}
          </button>
        ))}
      </div>
      {keuze === "offerte" && (
        <form className="crm-form card" onSubmit={(e) => { e.preventDefault(); void zet("offerte", { offerte: v.offerte, offerte_op: v.offerte_op }); }}>
          <label>Offertedatum<input type="date" value={v.offerte_op} onChange={(e) => setV({ ...v, offerte_op: e.target.value })} required /></label>
          <label>Offertewaarde (€, excl. btw)<input inputMode="decimal" value={v.offerte} onChange={(e) => setV({ ...v, offerte: e.target.value })} required /></label>
          <button type="submit" className="button button--small">Naar Offerte opgestuurd</button>
        </form>
      )}
      {keuze === "geaccepteerd" && (
        <form className="crm-form card" onSubmit={(e) => { e.preventDefault(); void zet("geaccepteerd", { waarde: v.waarde, sluitdatum: v.sluitdatum }); }}>
          <label>Definitieve dealwaarde (€, excl. btw)<input inputMode="decimal" value={v.waarde} onChange={(e) => setV({ ...v, waarde: e.target.value })} required /></label>
          <label>Sluitingsdatum<input type="date" value={v.sluitdatum} onChange={(e) => setV({ ...v, sluitdatum: e.target.value })} required /></label>
          <span className="small muted">De toegeschreven setter krijgt 5% van deze waarde (closecommissie, status verdiend).</span>
          <button type="submit" className="button button--small">Naar Geaccepteerd</button>
        </form>
      )}
      {fout && <div className="alert"><span className="small">{fout}</span></div>}
    </Sheet>
  );
}
