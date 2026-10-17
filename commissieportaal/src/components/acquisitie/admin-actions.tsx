"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button type="button" className="button button--ghost button--small" disabled={busy} onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/admin/acquisitie/sync", { method: "POST" }).catch(() => null);
        const d = await res?.json().catch(() => null);
        setMsg(d?.message ?? "Mislukt.");
        setBusy(false);
        router.refresh();
      }}>{busy ? "Bezig…" : "Nu bijwerken uit Calendly"}</button>
      {msg && <span className="small muted"> {msg}</span>}
    </span>
  );
}

export function ApproveAcq({ setterId, start, bedrag, lopend }: { setterId: string; start: string; bedrag: string; lopend: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="approve">
      {lopend && <p className="muted small">Deze periode loopt nog. Keur pas goed als de periode voorbij is en alle no-shows in Calendly zijn gemarkeerd.</p>}
      {confirm && <p className="alert">Goedkeuren zet {bedrag} vast voor deze periode. Dit kun je niet terugdraaien.</p>}
      <div className="approve__buttons">
        <button type="button" className="button" onClick={async () => {
          if (!confirm) return setConfirm(true);
          const res = await fetch("/api/admin/acquisitie/goedkeuren", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setterId, start }) }).catch(() => null);
          const d = await res?.json().catch(() => null);
          setMsg(d?.message ?? "Mislukt.");
          setConfirm(false);
          router.refresh();
        }}>{confirm ? `Ja, goedkeuren (${bedrag})` : "Goedkeuren"}</button>
        {confirm && <button type="button" className="button button--ghost" onClick={() => setConfirm(false)}>Annuleren</button>}
      </div>
      {msg && <span className="small">{msg}</span>}
    </div>
  );
}
