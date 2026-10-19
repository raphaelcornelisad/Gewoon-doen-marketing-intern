"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok && !!data?.ok, message: (data?.message as string | undefined) ?? null, data };
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  async function run(url: string, body: unknown, okTekst = "Opgeslagen.") {
    setBusy(true);
    const r = await post(url, body);
    setBusy(false);
    setMsg({ ok: r.ok, tekst: r.message ?? (r.ok ? okTekst : "Mislukt.") });
    if (r.ok) router.refresh();
    return r;
  }
  return { busy, msg, run };
}

const Msg = ({ m }: { m: { ok: boolean; tekst: string } | null }) => (m ? <span className={`small ${m.ok ? "muted" : "field-error"}`}>{m.tekst}</span> : null);

export function StageButtons({ oppId, fase, fases, disabled }: { oppId: string; fase: string; fases: { key: string; label: string }[]; disabled: boolean }) {
  const a = useAction();
  return (
    <div className="crm-form">
      <div className="crm-stages" role="group" aria-label="Fase">
        {fases.map((f) => (
          <button key={f.key} type="button" className="crm-stage" aria-pressed={f.key === fase} disabled={disabled || a.busy} onClick={() => a.run(`/api/crm/opp/${oppId}`, { fase: f.key }, `Naar ${f.label}.`)}>
            {f.label}
          </button>
        ))}
      </div>
      <Msg m={a.msg} />
    </div>
  );
}

export function WaardeForm({ oppId, waarde, disabled }: { oppId: string; waarde: string; disabled: boolean }) {
  const a = useAction();
  const [v, setV] = useState(waarde);
  return (
    <form
      className="crm-form"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(`/api/crm/opp/${oppId}`, { waarde: v });
      }}
    >
      <label>
        Waarde (€)
        <span className="inline-form__row">
          <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="bv. 1.500" disabled={disabled} />
          <button type="submit" className="button button--small" disabled={disabled || a.busy}>Opslaan</button>
        </span>
      </label>
      <Msg m={a.msg} />
    </form>
  );
}

export function SetterSelect({ oppId, value, setters }: { oppId: string; value: string; setters: { id: string; naam: string }[] }) {
  const a = useAction();
  return (
    <label className="crm-form">
      Setter-tag (ingepland door)
      <select defaultValue={value} disabled={a.busy} onChange={(e) => a.run(`/api/crm/opp/${oppId}`, { setterId: e.target.value || null })}>
        <option value="">Geen</option>
        {setters.map((s) => (
          <option key={s.id} value={s.id}>{s.naam}</option>
        ))}
      </select>
      <Msg m={a.msg} />
    </label>
  );
}

export function OwnerSelect({ contactId, value, setters }: { contactId: string; value: string; setters: { id: string; naam: string }[] }) {
  const a = useAction();
  return (
    <label className="crm-form">
      Eigenaar (outbound)
      <select defaultValue={value} disabled={a.busy} onChange={(e) => a.run(`/api/crm/contact/${contactId}`, { eigenaar_id: e.target.value || null })}>
        <option value="">Niemand (vrij op te pakken)</option>
        {setters.map((s) => (
          <option key={s.id} value={s.id}>{s.naam}</option>
        ))}
      </select>
      <Msg m={a.msg} />
    </label>
  );
}

export interface ContactFields {
  salon_naam: string;
  contactpersoon: string;
  telefoon: string;
  email: string;
  website: string;
  stad: string;
  provincie: string;
  behandelingen: string;
}

export function ContactForm({ contactId, initial, disabled, provincies }: { contactId?: string; initial: ContactFields; disabled?: boolean; provincies: string[] }) {
  const router = useRouter();
  const a = useAction();
  const [v, setV] = useState(initial);
  const set = (k: keyof ContactFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="crm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(contactId ? `/api/crm/contact/${contactId}` : "/api/crm/contact", v);
        if (r.ok && !contactId && r.data?.id) router.push(`/crm/lead/${r.data.id}`);
      }}
    >
      <label>Salonnaam *<input required value={v.salon_naam} onChange={set("salon_naam")} disabled={disabled} /></label>
      <div className="row">
        <label>Contactpersoon<input value={v.contactpersoon} onChange={set("contactpersoon")} disabled={disabled} /></label>
        <label>Telefoon<input type="tel" value={v.telefoon} onChange={set("telefoon")} disabled={disabled} /></label>
      </div>
      <div className="row">
        <label>E-mail<input type="email" value={v.email} onChange={set("email")} disabled={disabled} /></label>
        <label>Website<input value={v.website} onChange={set("website")} disabled={disabled} /></label>
      </div>
      <div className="row">
        <label>Stad<input value={v.stad} onChange={set("stad")} disabled={disabled} /></label>
        <label>
          Provincie
          <select value={v.provincie} onChange={set("provincie")} disabled={disabled}>
            <option value="">Automatisch op stad</option>
            {provincies.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label>Behandelingen (komma tussen)<input value={v.behandelingen} onChange={set("behandelingen")} placeholder="Laser, Injectables" disabled={disabled} /></label>
      {!disabled && <button type="submit" className="button button--small" disabled={a.busy}>{contactId ? "Gegevens opslaan" : "Lead toevoegen"}</button>}
      <Msg m={a.msg} />
    </form>
  );
}

export function NoteForm({ contactId }: { contactId: string }) {
  const a = useAction();
  const [t, setT] = useState("");
  return (
    <form
      className="crm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(`/api/crm/contact/${contactId}/notitie`, { tekst: t }, "Notitie toegevoegd.");
        if (r.ok) setT("");
      }}
    >
      <textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Notitie, bv. 'Terugbellen dinsdag na 14:00'" required />
      <button type="submit" className="button button--small" disabled={a.busy}>Notitie toevoegen</button>
      <Msg m={a.msg} />
    </form>
  );
}

export function ImportForm() {
  const a = useAction();
  const [url, setUrl] = useState("");
  const [res, setRes] = useState<null | { toegevoegd: number; bestaand: number; dubbel: number; zonderProvincie: number; overgeslagen: { tab: string; reden: string }[] }>(null);
  return (
    <form
      className="crm-form card"
      onSubmit={async (e) => {
        e.preventDefault();
        setRes(null);
        const r = await a.run("/api/crm/import", { url }, "Geïmporteerd.");
        if (r.ok) setRes(r.data);
      }}
    >
      <label>Link naar de Google Sheet<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required /></label>
      <button type="submit" className="button button--small" disabled={a.busy}>{a.busy ? "Inlezen…" : "Importeren"}</button>
      {res ? (
        <div className="notice notice--ok">
          <strong>{res.toegevoegd} nieuwe leads toegevoegd</strong>
          <span className="small">{res.bestaand} stonden er al in · {res.dubbel} dubbel in de sheet · {res.zonderProvincie} zonder provincie (stad onbekend)</span>
          {res.overgeslagen.map((o) => <span key={o.tab} className="small">Tab “{o.tab}” overgeslagen: {o.reden}</span>)}
        </div>
      ) : (
        <Msg m={a.msg} />
      )}
    </form>
  );
}

export function SyncButton() {
  const a = useAction();
  return (
    <span>
      <button type="button" className="button button--small button--ghost" disabled={a.busy} onClick={() => a.run("/api/crm/sync", {})}>
        {a.busy ? "Bezig…" : "Calendly nu ophalen"}
      </button>{" "}
      <Msg m={a.msg} />
    </span>
  );
}
