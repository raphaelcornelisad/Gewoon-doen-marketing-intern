"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./sheet";

export function CommissieActies({ setterId, periode }: { setterId: string; periode: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const doe = async (actie: string, vraag: string) => {
    if (!confirm(vraag)) return;
    setBusy(true);
    const r = await post("/api/crm/commissie", { actie, setterId, periode });
    setBusy(false);
    setMsg(r.message ?? (r.ok ? "Klaar." : "Mislukt."));
    router.refresh();
  };
  return (
    <span className="inline-form__row">
      <button type="button" className="button button--small" disabled={busy} onClick={() => doe("goedkeuren", "Alle verdiende regels van deze periode goedkeuren?")}>Goedkeuren</button>
      <button type="button" className="button button--small button--ghost" disabled={busy} onClick={() => doe("uitbetalen", "Alle goedgekeurde regels als uitbetaald markeren?")}>Markeer uitbetaald</button>
      {msg && <span className="small muted">{msg}</span>}
    </span>
  );
}

export function Herbereken() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className="linkbutton small" onClick={async () => { const r = await post("/api/crm/commissie", { actie: "herbereken" }); setMsg(r.message); router.refresh(); }}>Herberekenen</button>
      {msg && <span className="small muted"> {msg}</span>}
    </span>
  );
}
