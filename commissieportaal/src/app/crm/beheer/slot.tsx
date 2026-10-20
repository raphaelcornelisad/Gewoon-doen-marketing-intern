"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/components/crm/sheet";

export function BeheerSlot({ next, eersteKeer }: { next: string; eersteKeer: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ wachtwoord: "", nieuw: "", herhaal: "" });
  const [fout, setFout] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="crm-sheet" role="dialog" aria-modal="true" aria-label="Beheer ontgrendelen">
      <form
        className="crm-sheet__panel crm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await post("/api/crm/beheer", eersteKeer ? { nieuw: v.nieuw, herhaal: v.herhaal } : { wachtwoord: v.wachtwoord });
          setBusy(false);
          if (!r.ok) return setFout(r.message ?? "Mislukt.");
          router.replace(next);
          router.refresh();
        }}
      >
        <strong style={{ fontSize: 18 }}>🔒 Beheer</strong>
        {eersteKeer ? (
          <>
            <span className="small muted">Stel eenmalig een beheerwachtwoord in (minstens 10 tekens). Dit staat los van je inloglink; deel het met niemand.</span>
            <label>Nieuw wachtwoord<input type="password" autoComplete="new-password" autoFocus value={v.nieuw} onChange={(e) => setV({ ...v, nieuw: e.target.value })} required /></label>
            <label>Herhaal wachtwoord<input type="password" autoComplete="new-password" value={v.herhaal} onChange={(e) => setV({ ...v, herhaal: e.target.value })} required /></label>
          </>
        ) : (
          <>
            <span className="small muted">Voer het beheerwachtwoord in. Het blijft 8 uur ontgrendeld op dit apparaat.</span>
            <label>Wachtwoord<input type="password" autoComplete="current-password" autoFocus value={v.wachtwoord} onChange={(e) => setV({ ...v, wachtwoord: e.target.value })} required /></label>
          </>
        )}
        {fout && <span className="small field-error">{fout}</span>}
        <div className="inline-form__row">
          <button type="submit" className="button button--small" disabled={busy}>{eersteKeer ? "Instellen en openen" : "Ontgrendelen"}</button>
          <button type="button" className="linkbutton" onClick={() => router.push("/crm")}>Annuleren</button>
        </div>
      </form>
    </div>
  );
}
