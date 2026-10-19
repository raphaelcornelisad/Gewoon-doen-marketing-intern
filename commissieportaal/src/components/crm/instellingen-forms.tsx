"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./sheet";

function useOpslaan() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (soort: string, data?: unknown) => {
    setBusy(true);
    const r = await post("/api/crm/instellingen", { soort, data });
    setBusy(false);
    setMsg({ ok: r.ok, t: r.message ?? (r.ok ? "Opgeslagen." : "Mislukt.") });
    if (r.ok) router.refresh();
    return r.ok;
  };
  const Msg = () => (msg ? <span className={`small ${msg.ok ? "muted" : "field-error"}`}>{msg.t}</span> : null);
  return { run, busy, Msg };
}

type S = Record<string, string | number | boolean | null>;

export function AlgemeenForm({ s }: { s: S }) {
  const o = useOpslaan();
  const [v, setV] = useState(s);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form className="crm-form" onSubmit={(e) => { e.preventDefault(); void o.run("instellingen", v); }}>
      <div className="row">
        <label>Calendly-link kennismakingsgesprek<input value={String(v.calendly_url_kennismaking ?? "")} onChange={set("calendly_url_kennismaking")} placeholder="https://calendly.com/…/kennismaking" /></label>
        <label>Naam afspraaktype in Calendly<input value={String(v.calendly_event_kennismaking)} onChange={set("calendly_event_kennismaking")} /></label>
      </div>
      <div className="row">
        <label>Calendly-link salesgesprek<input value={String(v.calendly_url_sales ?? "")} onChange={set("calendly_url_sales")} placeholder="https://calendly.com/…/salesgesprek" /></label>
        <label>Naam afspraaktype in Calendly<input value={String(v.calendly_event_sales)} onChange={set("calendly_event_sales")} /></label>
      </div>
      <label>Campagnecode (utm_campaign)<input value={String(v.utm_campaign)} onChange={set("utm_campaign")} /></label>
      <span className="small muted">Zet in Calendly bij beide afspraaktypes als eerste vraag “Telefoonnummer” en als tweede “Naam salon/kliniek”; het CRM vult die vooraf in (a1/a2).</span>
      <div className="row">
        <label className="crm-check"><input type="checkbox" checked={!!v.auto_doorbellen} onChange={set("auto_doorbellen")} /> Automatisch doorbellen</label>
        <label>Aftellen (seconden)<input type="number" min={0} max={60} value={Number(v.aftel_sec)} onChange={set("aftel_sec")} /></label>
        <label>Reservering per lead (minuten)<input type="number" min={2} max={120} value={Number(v.reservering_min)} onChange={set("reservering_min")} /></label>
      </div>
      <div className="row">
        <label className="crm-check"><input type="checkbox" checked={!!v.opnemen} onChange={set("opnemen")} /> Gesprekken opnemen (Twilio)</label>
        <label>Bewaartermijn opnames/transcripten (dagen)<input type="number" min={1} max={3650} value={Number(v.bewaartermijn_dagen)} onChange={set("bewaartermijn_dagen")} /></label>
      </div>
      <label>Opnamemelding voor de gebelde partij<input value={String(v.opname_melding)} onChange={set("opname_melding")} /></label>
      <button type="submit" className="button button--small" disabled={o.busy}>Opslaan</button>
      <o.Msg />
    </form>
  );
}

export function KnopActie({ soort, label, bevestig, url }: { soort?: string; label: string; bevestig?: string; url?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-form__row">
      <button
        type="button"
        className="button button--small button--ghost"
        disabled={busy}
        onClick={async () => {
          if (bevestig && !confirm(bevestig)) return;
          setBusy(true);
          const r = await post(url ?? "/api/crm/instellingen", url ? {} : { soort });
          setBusy(false);
          setMsg(r.message ?? (r.ok ? "Klaar." : "Mislukt."));
          router.refresh();
        }}
      >
        {busy ? "Bezig…" : label}
      </button>
      {msg && <span className="small muted">{msg}</span>}
    </span>
  );
}

type Script = { id?: string; naam: string; campagne?: string | null; opening: string; kwalificatie: string; pitch: string; bezwaren: { bezwaar: string; antwoord: string }[]; afsluiting: string; actief: boolean };

export function ScriptForm({ script }: { script?: Script }) {
  const o = useOpslaan();
  const [v, setV] = useState<Script>(script ?? { naam: "", campagne: "", opening: "", kwalificatie: "", pitch: "", bezwaren: [], afsluiting: "", actief: true });
  const t = (k: keyof Script) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="crm-form card" onSubmit={(e) => { e.preventDefault(); void o.run("script", v); }}>
      <div className="row">
        <label>Naam<input value={v.naam} onChange={t("naam")} required /></label>
        <label>Campagne / doelgroep<input value={v.campagne ?? ""} onChange={t("campagne")} /></label>
        <label className="crm-check"><input type="checkbox" checked={v.actief} onChange={(e) => setV({ ...v, actief: e.target.checked })} /> Actief</label>
      </div>
      <label>Opening<textarea rows={2} value={v.opening} onChange={t("opening")} /></label>
      <label>Kwalificatievragen<textarea rows={3} value={v.kwalificatie} onChange={t("kwalificatie")} /></label>
      <label>Pitch<textarea rows={3} value={v.pitch} onChange={t("pitch")} /></label>
      {v.bezwaren.map((b, i) => (
        <div key={i} className="row">
          <input value={b.bezwaar} placeholder="Bezwaar" onChange={(e) => setV({ ...v, bezwaren: v.bezwaren.map((x, j) => (j === i ? { ...x, bezwaar: e.target.value } : x)) })} />
          <input value={b.antwoord} placeholder="Antwoord" onChange={(e) => setV({ ...v, bezwaren: v.bezwaren.map((x, j) => (j === i ? { ...x, antwoord: e.target.value } : x)) })} />
          <button type="button" className="linkbutton" onClick={() => setV({ ...v, bezwaren: v.bezwaren.filter((_, j) => j !== i) })}>Verwijderen</button>
        </div>
      ))}
      <button type="button" className="linkbutton small" onClick={() => setV({ ...v, bezwaren: [...v.bezwaren, { bezwaar: "", antwoord: "" }] })}>+ Bezwaar</button>
      <label>Afsluiting naar kennismaking<textarea rows={2} value={v.afsluiting} onChange={t("afsluiting")} /></label>
      <span className="small muted">Variabelen: {"{{setter}}"}, {"{{salon}}"}, {"{{voornaam}}"}. Het nieuwste actieve script staat in het belscherm.</span>
      <button type="submit" className="button button--small" disabled={o.busy}>Script opslaan</button>
      <o.Msg />
    </form>
  );
}

type Tpl = { id?: string; naam: string; kanaal: string; doel: string; tekst: string; provider_template_id?: string | null; categorie: string; actief: boolean };

export function TemplateForm({ tpl }: { tpl?: Tpl }) {
  const o = useOpslaan();
  const [v, setV] = useState<Tpl>(tpl ?? { naam: "", kanaal: "whatsapp", doel: "wavo", tekst: "", provider_template_id: "", categorie: "marketing", actief: true });
  const t = (k: keyof Tpl) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="crm-form card" onSubmit={(e) => { e.preventDefault(); void o.run("template", { ...v, provider_template_id: v.provider_template_id ?? "" }); }}>
      <div className="row">
        <label>Naam<input value={v.naam} onChange={t("naam")} required /></label>
        <label>Kanaal<select value={v.kanaal} onChange={t("kanaal")}><option value="whatsapp">WhatsApp</option><option value="sms">Sms</option></select></label>
        <label>Doel<select value={v.doel} onChange={t("doel")}><option value="wavo">WAVO na gemiste oproep</option><option value="bevestiging">Afspraakbevestiging</option><option value="herinnering">Herinnering</option><option value="algemeen">Algemeen</option></select></label>
        <label>Categorie<select value={v.categorie} onChange={t("categorie")}><option value="marketing">Marketing</option><option value="utility">Utility (service)</option></select></label>
      </div>
      <label>Tekst<textarea rows={3} value={v.tekst} onChange={t("tekst")} required /></label>
      <label>Goedgekeurde WhatsApp-template (Twilio Content SID, HX…)<input value={v.provider_template_id ?? ""} onChange={t("provider_template_id")} placeholder="Leeg = nog niet goedgekeurd" /></label>
      <span className="small muted">Variabelen in de tekst: {"{{voornaam}}"}, {"{{salon}}"}, {"{{setter}}"}. In de goedgekeurde Twilio-template: {"{{1}}"} = voornaam, {"{{2}}"} = salon, {"{{3}}"} = setter.</span>
      <label className="crm-check"><input type="checkbox" checked={v.actief} onChange={(e) => setV({ ...v, actief: e.target.checked })} /> Actief</label>
      <button type="submit" className="button button--small" disabled={o.busy}>Template opslaan</button>
      <o.Msg />
    </form>
  );
}

type G = { id?: string; naam: string; email: string; rol: string; start_datum: string; actief: boolean; utm_source?: string | null };

export function GebruikerForm({ g }: { g?: G }) {
  const o = useOpslaan();
  const [v, setV] = useState<G>(g ?? { naam: "", email: "", rol: "setter", start_datum: new Date().toISOString().slice(0, 10), actief: true, utm_source: "" });
  const t = (k: keyof G) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="crm-form card" onSubmit={(e) => { e.preventDefault(); void o.run("gebruiker", { ...v, utm_source: v.utm_source ?? "" }); }}>
      <div className="row">
        <label>Naam<input value={v.naam} onChange={t("naam")} required /></label>
        <label>E-mail (inlog)<input type="email" value={v.email} onChange={t("email")} required /></label>
        <label>Rol<select value={v.rol} onChange={t("rol")}><option value="setter">Setter</option><option value="sales">Salesmedewerker</option></select></label>
        <label>Startdatum<input type="date" value={v.start_datum} onChange={t("start_datum")} required /></label>
      </div>
      <div className="row">
        <label>Oude persoonlijke Calendly-code (optioneel)<input value={v.utm_source ?? ""} onChange={t("utm_source")} /></label>
        <label className="crm-check"><input type="checkbox" checked={v.actief} onChange={(e) => setV({ ...v, actief: e.target.checked })} /> Actief</label>
      </div>
      <button type="submit" className="button button--small" disabled={o.busy}>{g ? "Opslaan" : "Gebruiker toevoegen"}</button>
      <o.Msg />
    </form>
  );
}
