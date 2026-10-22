"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

export async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok && !!data?.ok, message: (data?.message as string | undefined) ?? null, data };
}

/** Zet de pagina achter een paneel vast, zodat swipen op iOS alleen het paneel beweegt. */
function vergrendelScroll() {
  const b = document.body;
  const y = window.scrollY;
  const oud = { position: b.style.position, top: b.style.top, width: b.style.width, overflow: b.style.overflow };
  Object.assign(b.style, { position: "fixed", top: `-${y}px`, width: "100%", overflow: "hidden" });
  return () => {
    Object.assign(b.style, oud);
    window.scrollTo(0, y);
  };
}

/** Paneel dat onderin (mobiel) of als venster (desktop) opent. */
export function Sheet({ titel, onClose, children }: { titel: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => vergrendelScroll(), []);
  return (
    <div className="crm-sheet" role="dialog" aria-modal="true" aria-label={titel} onClick={onClose}>
      <div className="crm-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <header className="crm-sheet__head">
          <strong>{titel}</strong>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Sluiten"><Icon name="close" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function TagEditor({ contactId, tags, alle, onSaved }: { contactId: string; tags: string[]; alle: string[]; onSaved?: (t: string[]) => void }) {
  const router = useRouter();
  const [lijst, setLijst] = useState(tags);
  const [nieuw, setNieuw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function save(t: string[]) {
    setLijst(t);
    const r = await post(`/api/crm/contact/${contactId}`, { tags: t });
    setMsg(r.ok ? "Opgeslagen." : (r.message ?? "Opslaan mislukt."));
    if (r.ok) {
      onSaved?.(t);
      router.refresh();
    } else setLijst(lijst);
  }
  const suggesties = alle.filter((t) => !lijst.includes(t));
  return (
    <div className="crm-form">
      <div className="crm-chips">
        {lijst.length === 0 && <span className="small muted">Nog geen tags.</span>}
        {lijst.map((t) => (
          <button key={t} type="button" className="crm-chip crm-chip--tag crm-chip--btn" onClick={() => save(lijst.filter((x) => x !== t))} aria-label={`Tag ${t} verwijderen`}>
            {t} ×
          </button>
        ))}
      </div>
      <form
        className="inline-form__row"
        onSubmit={(e) => {
          e.preventDefault();
          if (nieuw.trim()) save([...lijst, nieuw.trim()]);
          setNieuw("");
        }}
      >
        <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder="Nieuwe tag, bv. warm" aria-label="Nieuwe tag" />
        <button type="submit" className="button button--small">Toevoegen</button>
      </form>
      {suggesties.length > 0 && (
        <div className="crm-chips">
          {suggesties.slice(0, 20).map((t) => (
            <button key={t} type="button" className="crm-chip crm-chip--btn" onClick={() => save([...lijst, t])}>+ {t}</button>
          ))}
        </div>
      )}
      {msg && <span className="small muted">{msg}</span>}
    </div>
  );
}

export function QuickNote({ contactId, onDone }: { contactId: string; onDone: () => void }) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  return (
    <form
      className="crm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post(`/api/crm/contact/${contactId}/notitie`, { tekst: t });
        setBusy(false);
        if (r.ok) {
          setT("");
          setFout(null);
          onDone();
        }
        else setFout(r.message ?? "Opslaan mislukt.");
      }}
    >
      <textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Bv. 'Eigenaar terugbellen dinsdag na 14:00'" required />
      <button type="submit" className="button button--small" disabled={busy}>{busy ? "Opslaan…" : "Notitie opslaan"}</button>
      {fout && <span className="small field-error">{fout}</span>}
    </form>
  );
}
