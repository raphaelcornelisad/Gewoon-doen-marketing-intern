"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok && !!data?.ok, data };
}

type CreateResult = {
  ok: boolean;
  id?: string;
  message?: string;
  lijsten?: number;
  leads?: number;
  dubbel?: number;
  nietHerkend?: { bron: string; tab: string; groen: number }[];
  fouten?: string[];
};

export function NewCampaignForm() {
  const router = useRouter();
  const [naam, setNaam] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<CreateResult | null>(null);

  return (
    <form
      className="form card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await post("/api/admin/reactivatie", { naam, links });
        setR({ ...(res.data ?? {}), ok: res.ok });
        setBusy(false);
        if (res.ok) {
          setLinks("");
          router.refresh();
        }
      }}
    >
      <div className="field">
        <label htmlFor="naam">Naam campagne</label>
        <input id="naam" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Reactivatie november" />
      </div>
      <div className="field">
        <label htmlFor="links">Sheetlinks van de setters</label>
        <textarea id="links" rows={6} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Eén link per regel" required />
        <span className="hint">Alleen groene leads worden meegenomen. Per tabblad wordt de salon herkend aan de tabnaam.</span>
      </div>
      <button type="submit" className="button" disabled={busy}>{busy ? "Sheets inlezen…" : "Lijsten aanmaken"}</button>
      {r && (
        <div className={r.ok ? "notice notice--ok" : "alert"}>
          <strong>{r.ok ? `${r.lijsten} salons, ${r.leads} klantnamen` : (r.message ?? "Aanmaken mislukt")}</strong>
          {!!r.dubbel && <span className="small">{r.dubbel} dubbele namen samengevoegd.</span>}
          {!!r.nietHerkend?.length && (
            <span className="small">
              Salon niet herkend (niet meegenomen): {r.nietHerkend.map((u) => `${u.tab} (${u.groen}, ${u.bron})`).join(", ")}
            </span>
          )}
          {r.fouten?.map((f) => <span key={f} className="small">{f}</span>)}
        </div>
      )}
    </form>
  );
}

export function SendButton({ campaignId, listId, label }: { campaignId: string; listId?: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className={listId ? "linkbutton" : "button"}
        disabled={busy}
        onClick={async () => {
          if (!listId && !confirm("Alle nog niet verstuurde lijsten versturen?")) return;
          setBusy(true);
          const r = await post(`/api/admin/reactivatie/${campaignId}/versturen`, { listId });
          setMsg(r.data?.message ?? (r.ok ? "Verstuurd" : "Mislukt"));
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Bezig…" : label}
      </button>
      {msg && <span className="small muted" style={{ whiteSpace: "pre-line", display: "block" }}>{msg}</span>}
    </span>
  );
}
