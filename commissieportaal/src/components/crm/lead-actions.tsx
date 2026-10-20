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





export interface ContactFields {
  salon_naam: string;
  contactpersoon: string;
  telefoon: string;
  email: string;
  website: string;
  adres: string;
  postcode: string;
  stad: string;
  provincie: string;
  type_bedrijf: string;
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
        <label>Adres<input value={v.adres} onChange={set("adres")} disabled={disabled} /></label>
        <label>Postcode<input value={v.postcode} onChange={set("postcode")} disabled={disabled} /></label>
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
      <label>Type bedrijf<input value={v.type_bedrijf} onChange={set("type_bedrijf")} placeholder="Schoonheidssalon, huidkliniek…" disabled={disabled} /></label>
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
  const [res, setRes] = useState<null | { toegevoegd: number; bestaand: number; dubbel: number; twijfel: number; zonderTelefoon: number; zonderProvincie: number; perFase?: Record<string, number>; overgeslagen: { tab: string; reden: string }[] }>(null);
  async function stuur(body: Record<string, unknown>) {
    setRes(null);
    const r = await a.run("/api/crm/import", body, "Geïmporteerd.");
    if (r.ok) setRes(r.data);
  }
  return (
    <div className="crm-form">
      <form className="crm-form card" onSubmit={(e) => { e.preventDefault(); void stuur({ url }); }}>
        <label>Google Sheet-link<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required /></label>
        <button type="submit" className="button button--small" disabled={a.busy}>{a.busy ? "Inlezen…" : "Sheet importeren"}</button>
      </form>
      <div className="crm-form card">
        <label>
          CSV-bestand (Outscraper, Apify of eigen export)
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={a.busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 15_000_000) return alert("Bestand is groter dan 15 MB. Splits het op.");
              await stuur({ csv: await f.text(), bestandsnaam: f.name });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {res ? (
        <div className="notice notice--ok">
          <strong>{res.toegevoegd} nieuwe leads toegevoegd</strong>
          <span className="small">{res.bestaand} stonden er al in (zelfde telefoon of e-mail) · {res.dubbel} dubbel in het bestand · {res.twijfel} twijfelgevallen in Beoordelen · {res.zonderTelefoon} zonder telefoonnummer · {res.zonderProvincie} zonder provincie</span>
          {res.perFase && (
            <span className="small">
              Per fase:{" "}
              {Object.entries(res.perFase)
                .map(([f, n]) => `${({ nieuw: "Nieuw", wafu: "WAFU", terugbellen: "Terugbellen", niet_geinteresseerd: "Niet geïnteresseerd", ongeldig_nummer: "Ongeldig nummer", ingepland: "Ingepland (ook in Call geboekt)", niet_benaderen: "Niet meer benaderen" } as Record<string, string>)[f] ?? f} ${n}`)
                .join(" · ")}
            </span>
          )}
          {res.overgeslagen.filter((o) => !/^Sheet\d*$/i.test(o.tab.trim())).map((o) => <span key={o.tab} className="small">Tab “{o.tab}” overgeslagen: {o.reden}</span>)}
        </div>
      ) : (
        <Msg m={a.msg} />
      )}
    </div>
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

export function StatusSelect({ oppId, fase, fases, disabled, label = "Status" }: { oppId: string; fase: string; fases: { key: string; label: string }[]; disabled: boolean; label?: string }) {
  const a = useAction();
  const [v, setV] = useState(fase);
  return (
    <label className="crm-field">
      {label}
      <select
        value={v}
        disabled={disabled || a.busy}
        onChange={async (e) => {
          const oud = v;
          setV(e.target.value);
          const r = await a.run(`/api/crm/opp/${oppId}`, { fase: e.target.value }, "Status aangepast.");
          if (!r.ok) setV(oud);
        }}
      >
        {fases.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <Msg m={a.msg} />
    </label>
  );
}

export function WaardeField({ oppId, cents, disabled }: { oppId: string; cents: number | null; disabled: boolean }) {
  const a = useAction();
  const start = cents ? (cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  const [v, setV] = useState(start);
  return (
    <label className="crm-field">
      Waarde
      <span className="crm-euro">
        <span aria-hidden="true">€</span>
        <input
          inputMode="decimal"
          value={v}
          placeholder="0,00"
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== start && a.run(`/api/crm/opp/${oppId}`, { waarde: v })}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </span>
      <Msg m={a.msg} />
    </label>
  );
}

export function OwnerField({ contactId, oppId, value, setters, label, soort }: { contactId: string; oppId?: string; value: string; setters: { id: string; naam: string }[]; label: string; soort: "eigenaar" | "setter" | "verkoper" }) {
  const a = useAction();
  return (
    <label className="crm-field">
      {label}
      <select
        defaultValue={value}
        disabled={a.busy}
        onChange={(e) =>
          soort === "setter"
            ? a.run(`/api/crm/opp/${oppId}`, { setterId: e.target.value || null })
            : soort === "verkoper"
              ? a.run(`/api/crm/opp/${oppId}`, { verkoperId: e.target.value || null })
              : a.run(`/api/crm/contact/${contactId}`, { eigenaar_id: e.target.value || null })
        }
      >
        <option value="">Niet toegewezen</option>
        {setters.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
      </select>
      <Msg m={a.msg} />
    </label>
  );
}


export function EditableContact(props: { contactId: string; initial: ContactFields; disabled: boolean; provincies: string[] }) {
  const [bewerken, setBewerken] = useState(false);
  const v = props.initial;
  const rijen: [string, string][] = [
    ["Salonnaam", v.salon_naam],
    ["Contactpersoon", v.contactpersoon],
    ["Telefoon", v.telefoon],
    ["E-mail", v.email],
    ["Website", v.website],
    ["Adres", [v.adres, v.postcode].filter(Boolean).join(", ")],
    ["Stad", v.stad],
    ["Provincie", v.provincie],
    ["Type bedrijf", v.type_bedrijf],
    ["Behandelingen", v.behandelingen],
  ];
  return (
    <div className="crm-form">
      <div className="crm-toolbar">
        <strong>Contactgegevens</strong>
        {!props.disabled && (
          <button type="button" className="linkbutton" onClick={() => setBewerken(!bewerken)}>{bewerken ? "Sluiten" : "✎ Bewerken"}</button>
        )}
      </div>
      {bewerken ? (
        <ContactForm contactId={props.contactId} initial={props.initial} provincies={props.provincies} />
      ) : (
        <dl className="crm-kv">
          {rijen.map(([k, val]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{val || <span className="muted">–</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function OpvolgField({ contactId, waarde, disabled }: { contactId: string; waarde: string | null; disabled: boolean }) {
  const a = useAction();
  const lokaal = waarde ? new Date(new Date(waarde).getTime() - new Date(waarde).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const [v, setV] = useState(lokaal);
  return (
    <label className="crm-field">
      Volgend opvolgmoment
      <span className="inline-form__row">
        <input type="datetime-local" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} />
        <button type="button" className="button button--small button--ghost" disabled={disabled || a.busy} onClick={() => a.run(`/api/crm/contact/${contactId}`, { volgende_opvolging_op: v ? new Date(v).toISOString() : null })}>Opslaan</button>
      </span>
      <Msg m={a.msg} />
    </label>
  );
}

export function NietBenaderen({ contactId, aan, reden, disabled }: { contactId: string; aan: boolean; reden: string | null; disabled: boolean }) {
  const a = useAction();
  return (
    <div className="crm-field">
      Niet meer benaderen
      {aan ? (
        <span style={{ fontWeight: 400 }}>
          <strong style={{ color: "var(--primair)" }}>Ja</strong> · {reden}{" "}
          {!disabled && <button type="button" className="linkbutton" onClick={() => a.run(`/api/crm/contact/${contactId}`, { niet_benaderen: false })}>Opheffen</button>}
        </span>
      ) : (
        <span style={{ fontWeight: 400 }}>
          Nee{" "}
          {!disabled && (
            <button type="button" className="linkbutton" onClick={() => confirm("Deze lead nooit meer bellen of berichten sturen?") && a.run(`/api/crm/contact/${contactId}`, { niet_benaderen: true, niet_benaderen_reden: "Handmatig ingesteld" })}>
              Instellen
            </button>
          )}
        </span>
      )}
      <Msg m={a.msg} />
    </div>
  );
}

export function SluitdatumField({ oppId, waarde, disabled }: { oppId: string; waarde: string | null; disabled: boolean }) {
  const a = useAction();
  const [v, setV] = useState(waarde ?? "");
  return (
    <label className="crm-field">
      Sluitingsdatum
      <span className="inline-form__row">
        <input type="date" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} />
        <button type="button" className="button button--small button--ghost" disabled={disabled || a.busy} onClick={() => a.run(`/api/crm/opp/${oppId}`, { sluitdatum: v || null })}>Opslaan</button>
      </span>
      <Msg m={a.msg} />
    </label>
  );
}

export function AfspraakKnoppen({ id, status }: { id: string; status: string }) {
  const a = useAction();
  if (status === "geannuleerd" || status === "verplaatst") return null;
  return (
    <span className="inline-form__row">
      <button type="button" className="crm-stage" aria-pressed={status === "verschenen"} disabled={a.busy} onClick={() => a.run(`/api/crm/afspraak/${id}`, { status: "verschenen" }, "Verschenen.")}>Verschenen</button>
      <button type="button" className="crm-stage" aria-pressed={status === "no_show"} disabled={a.busy} onClick={() => a.run(`/api/crm/afspraak/${id}`, { status: "no_show" }, "No-show.")}>No-show</button>
      {(status === "verschenen" || status === "no_show") && (
        <button type="button" className="linkbutton small" disabled={a.busy} onClick={() => a.run(`/api/crm/afspraak/${id}`, { status: "gepland" }, "Teruggezet.")}>Terugzetten</button>
      )}
      <Msg m={a.msg} />
    </span>
  );
}

export function TaakAfvinken({ id, gedaan, titel }: { id: string; gedaan: boolean; titel: string }) {
  const a = useAction();
  return (
    <label className="crm-check">
      <input type="checkbox" defaultChecked={gedaan} disabled={a.busy} onChange={(e) => a.run(`/api/crm/taak/${id}`, { gedaan: e.target.checked })} />
      <span style={gedaan ? { textDecoration: "line-through", color: "var(--tekst-zacht)" } : undefined}>{titel}</span>
    </label>
  );
}

const CATS = [
  ["prijs", "Prijs"],
  ["timing", "Timing"],
  ["geen_interesse", "Geen interesse"],
  ["bestaande_leverancier", "Bestaande leverancier"],
  ["eerst_informatie", "Eerst informatie"],
  ["overig", "Overig"],
] as const;
export const categorieLabel = (k: string) => CATS.find((c) => c[0] === k)?.[1] ?? k;

export function AnalyseCorrectie({ callId, samenvatting, vervolgstap, bezwaren }: { callId: string; samenvatting: string | null; vervolgstap: string | null; bezwaren: { categorie: string; citaat: string; tijdstip_sec: number }[] }) {
  const a = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ samenvatting: samenvatting ?? "", vervolgstap: vervolgstap ?? "", bezwaren });
  if (!open) return <button type="button" className="linkbutton small" onClick={() => setOpen(true)}>Analyse corrigeren</button>;
  return (
    <form
      className="crm-form card"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(`/api/crm/oproep/${callId}`, v, "Correctie opgeslagen.");
        if (r.ok) setOpen(false);
      }}
    >
      <label>Samenvatting<textarea rows={3} value={v.samenvatting} onChange={(e) => setV({ ...v, samenvatting: e.target.value })} /></label>
      <label>Afgesproken vervolgstap<input value={v.vervolgstap} onChange={(e) => setV({ ...v, vervolgstap: e.target.value })} /></label>
      {v.bezwaren.map((b, i) => (
        <div key={i} className="row">
          <select value={b.categorie} onChange={(e) => setV({ ...v, bezwaren: v.bezwaren.map((x, j) => (j === i ? { ...x, categorie: e.target.value } : x)) })}>
            {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input value={b.citaat} onChange={(e) => setV({ ...v, bezwaren: v.bezwaren.map((x, j) => (j === i ? { ...x, citaat: e.target.value } : x)) })} />
          <button type="button" className="linkbutton" onClick={() => setV({ ...v, bezwaren: v.bezwaren.filter((_, j) => j !== i) })}>Verwijderen</button>
        </div>
      ))}
      <button type="button" className="linkbutton small" onClick={() => setV({ ...v, bezwaren: [...v.bezwaren, { categorie: "overig", citaat: "", tijdstip_sec: 0 }] })}>+ Bezwaar toevoegen</button>
      <button type="submit" className="button button--small" disabled={a.busy}>Opslaan</button>
      <Msg m={a.msg} />
    </form>
  );
}

