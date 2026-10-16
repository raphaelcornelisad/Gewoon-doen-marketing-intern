"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok && !!data?.ok, data };
}

type ApproveData = {
  message?: string;
  verstuurd?: { kliniek: string; to?: string; fout?: string }[];
  nietGekoppeld?: { tab: string; groen: number }[];
};

export function ApproveButton({ id, bedrag, testmodus }: { id: string; bedrag: string; testmodus: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm" | "busy">("idle");
  const [result, setResult] = useState<{ ok: boolean; data: ApproveData } | null>(null);

  async function go() {
    if (stage === "idle") return setStage("confirm");
    setStage("busy");
    const r = await post(`/api/admin/indiening/${id}/goedkeuren`, {});
    setResult(r);
    setStage("idle");
    router.refresh();
  }

  return (
    <div className="approve">
      {stage === "confirm" && (
        <p className="alert">
          Goedkeuren zet {bedrag} op slot en verstuurt de afvinklijsten naar de klinieken
          {testmodus ? " (testmodus: alle mails gaan naar jou)" : ""}. Dit kun je niet terugdraaien.
        </p>
      )}
      <div className="approve__buttons">
        <button type="button" className="button" disabled={stage === "busy"} onClick={go}>
          {stage === "confirm" ? `Ja, goedkeuren (${bedrag})` : stage === "busy" ? "Bezig…" : "Goedkeuren"}
        </button>
        {stage === "confirm" && (
          <button type="button" className="button button--ghost" onClick={() => setStage("idle")}>Annuleren</button>
        )}
      </div>
      {result && (
        <div className={result.ok ? "notice notice--ok" : "alert"}>
          <strong>{result.ok ? "Goedgekeurd" : (result.data?.message ?? "Goedkeuren mislukt")}</strong>
          {result.data?.verstuurd?.map((v) => (
            <div key={v.kliniek} className="small">
              {v.kliniek}: {v.to ? `verstuurd naar ${v.to}` : v.fout}
            </div>
          ))}
          {!!result.data?.nietGekoppeld?.length && (
            <div className="small">
              Geen kliniek gekoppeld (geen afvinklijst): {result.data.nietGekoppeld.map((u) => `${u.tab} (${u.groen})`).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OpkomstForm({ attendanceId, max, huidig }: { attendanceId: string; max: number; huidig: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(huidig === null ? "" : String(huidig));
  const [msg, setMsg] = useState<string | null>(null);

  async function save(aantal: number | null) {
    const r = await post("/api/admin/opkomst", { attendanceId, aantal });
    setMsg(r.data?.message ?? (r.ok ? "Opgeslagen." : "Opslaan mislukt."));
    if (r.ok) router.refresh();
  }

  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(value.trim() === "" ? null : Number(value));
      }}
    >
      <label htmlFor="opkomst">Aantal verschenen vaststellen</label>
      <span className="inline-form__row">
        <input id="opkomst" type="number" inputMode="numeric" min={0} max={max} value={value} onChange={(e) => setValue(e.target.value)} placeholder="volg klinieken" />
        <button type="submit" className="button button--small">Opslaan</button>
        {huidig !== null && (
          <button type="button" className="linkbutton" onClick={() => { setValue(""); save(null); }}>
            Terug naar klinieken
          </button>
        )}
      </span>
      {msg && <span className="small muted">{msg}</span>}
    </form>
  );
}

export function ResendButton({ checklistId, periode }: { checklistId: string; periode: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className="linkbutton"
        onClick={async () => {
          const r = await post(`/api/admin/afvinklijst/${checklistId}/versturen`, { periode });
          setMsg(r.data?.message ?? (r.ok ? "Verstuurd" : "Mislukt"));
          router.refresh();
        }}
      >
        Opnieuw versturen
      </button>
      {msg && <span className="small muted"> · {msg}</span>}
    </span>
  );
}

export function TestModeToggle({ aan }: { aan: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={aan ? "notice" : "notice notice--live"}>
      <strong>{aan ? "Testmodus staat aan" : "Testmodus staat uit"}</strong>
      <span className="small">
        {aan
          ? "Mails aan klinieken gaan naar jou in plaats van naar de kliniek."
          : "Mails aan klinieken gaan naar het echte adres van de kliniek."}
      </span>
      {aan && !confirm && (
        <button type="button" className="linkbutton" onClick={() => setConfirm(true)}>Testmodus uitzetten</button>
      )}
      {!aan && (
        <button type="button" className="linkbutton" onClick={async () => { await post("/api/admin/testmodus", { aan: true }); router.refresh(); }}>
          Testmodus aanzetten
        </button>
      )}
      {confirm && (
        <span className="small">
          Weet je het zeker? Klinieken krijgen dan echte mails.{" "}
          <button type="button" className="linkbutton" onClick={async () => { await post("/api/admin/testmodus", { aan: false }); setConfirm(false); router.refresh(); }}>
            Ja, uitzetten
          </button>{" "}
          <button type="button" className="linkbutton" onClick={() => setConfirm(false)}>Annuleren</button>
        </span>
      )}
    </div>
  );
}
