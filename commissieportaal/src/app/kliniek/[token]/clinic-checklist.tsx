"use client";

import { useMemo, useState } from "react";
import { brand } from "@/config/brand";

type Item = { id: string; naam: string; campagne: string; verschenen: boolean | null };

export function ClinicChecklist(p: {
  token: string;
  kliniek: string;
  periode: string;
  items: Item[];
  locked: boolean;
  ingediend: boolean;
  /** Optioneel: andere teksten/route, bv. voor reactivatie */
  apiBase?: string;
  eyebrow?: string;
  intro?: string;
  telLabel?: string;
}) {
  const apiBase = p.apiBase ?? "/api/kliniek";
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(
    Object.fromEntries(p.items.map((i) => [i.id, i.verschenen])),
  );
  const [status, setStatus] = useState<{ text: string; ok?: boolean } | null>(
    p.ingediend ? { text: "Ingediend. Je kunt nog aanpassen zolang de lijst open is.", ok: true } : null,
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of p.items) m.set(i.campagne, [...(m.get(i.campagne) ?? []), i]);
    return [...m.entries()];
  }, [p.items]);

  const vals = Object.values(answers);
  const done = vals.filter((v) => v !== null).length;
  const yes = vals.filter((v) => v === true).length;
  const open = p.items.length - done;

  function set(id: string, v: boolean) {
    if (p.locked) return;
    setAnswers((a) => ({ ...a, [id]: a[id] === v ? null : v }));
    setStatus({ text: "Niet opgeslagen wijzigingen" });
    setConfirm(false);
  }

  async function save(indienen: boolean) {
    if (indienen && open > 0 && !confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    const res = await fetch(`${apiBase}/${p.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ antwoorden: answers, indienen }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    setConfirm(false);
    if (res?.ok && data?.ok) setStatus({ text: indienen ? "Ingediend. Bedankt!" : `Opgeslagen · ${done} van ${p.items.length} ingevuld`, ok: true });
    else setStatus({ text: data?.message ?? "Opslaan mislukt. Controleer je internet en probeer opnieuw." });
  }

  return (
    <div className="clinic">
      <section className="hero">
        <p className="eyebrow">{p.eyebrow ?? "Opkomst bevestigen"}</p>
        <h1>{p.kliniek}</h1>
        {p.periode && <p className="lead">{p.periode}</p>}
      </section>

      {p.locked ? (
        <div className="alert">Deze lijst is afgesloten. Bedankt voor het invullen!</div>
      ) : (
        <p>{p.intro ?? "Geef per klant aan of ze op de afspraak is verschenen. Je kunt tussendoor opslaan en later verder gaan. Klik op Indienen als je klaar bent."}</p>
      )}

      <div className="progress" aria-live="polite">
        <div className="progress__track">
          <div className="progress__fill" style={{ width: `${p.items.length ? (done / p.items.length) * 100 : 0}%` }} />
        </div>
        <div className="progress__label">
          <span><strong>{done}</strong> van {p.items.length} ingevuld</span>
          <span><strong>{yes}</strong> {p.telLabel ?? "verschenen"}</span>
        </div>
      </div>

      {groups.map(([campagne, items]) => (
        <section key={campagne} className="clinic-group">
          <h2>
            {campagne} <span>{items.length} {items.length === 1 ? "klant" : "klanten"}</span>
          </h2>
          <ul className="clinic-rows">
            {items.map((i) => (
              <li key={i.id}>
                <span className="clinic-name">{i.naam}</span>
                <span className="seg" role="group" aria-label={`Verschenen: ${i.naam}`}>
                  <button type="button" data-v="ja" aria-pressed={answers[i.id] === true} disabled={p.locked} onClick={() => set(i.id, true)}>Ja</button>
                  <button type="button" data-v="nee" aria-pressed={answers[i.id] === false} disabled={p.locked} onClick={() => set(i.id, false)}>Nee</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="muted small">Vragen? Mail naar {brand.contactEmail}.</p>

      {!p.locked && (
        <div className="savebar">
          <div className="savebar__in">
            <span className={`savebar__status ${status?.ok ? "is-ok" : ""}`}>
              {confirm ? `Nog ${open} niet ingevuld. Toch indienen?` : (status?.text ?? "Nog niet opgeslagen")}
            </span>
            <span className="savebar__buttons">
              <button type="button" className="button button--ghost" disabled={busy} onClick={() => save(false)}>Opslaan</button>
              <button type="button" className="button" disabled={busy} onClick={() => save(true)}>
                {confirm ? "Ja, indienen" : "Indienen"}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
