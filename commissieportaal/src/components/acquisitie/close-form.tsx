"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CloseForm({ setterId, clientKey, huidig, opmerking }: { setterId: string; clientKey: string; huidig: number | null; opmerking: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bedrag, setBedrag] = useState(huidig === null ? "" : String(huidig).replace(".", ","));
  const [note, setNote] = useState(opmerking);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(value: string | null) {
    const res = await fetch("/api/admin/acquisitie/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setterId, clientKey, bedrag: value, opmerking: note }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setMsg(data?.message ?? "Opslaan mislukt.");
    if (res?.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <span>
        <button type="button" className="linkbutton" onClick={() => setOpen(true)}>
          {huidig === null ? "Close toevoegen" : "Close wijzigen"}
        </button>
        {msg && <span className="small muted"> · {msg}</span>}
      </span>
    );
  }
  return (
    <form className="correction-form" onSubmit={(e) => { e.preventDefault(); save(bedrag); }}>
      <div className="correction-form__row">
        <label>
          <span>Closebedrag (€)</span>
          <input inputMode="decimal" required value={bedrag} onChange={(e) => setBedrag(e.target.value)} placeholder="bijv. 3000" />
        </label>
        <label>
          <span>Opmerking</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="bijv. jaarcontract" />
        </label>
      </div>
      <div className="approve__buttons">
        <button type="submit" className="button button--small">Opslaan</button>
        {huidig !== null && <button type="button" className="button button--ghost button--small" onClick={() => save(null)}>Close verwijderen</button>}
        <button type="button" className="linkbutton" onClick={() => setOpen(false)}>Annuleren</button>
      </div>
      {msg && <span className="small muted">{msg}</span>}
    </form>
  );
}
