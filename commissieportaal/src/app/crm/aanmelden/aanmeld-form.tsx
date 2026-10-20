"use client";

import { useState } from "react";

export function AanmeldForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/crm/aanmelden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setMsg({ ok: !!data?.ok, tekst: data?.message ?? "Er ging iets mis. Probeer het opnieuw." });
    setBusy(false);
  }

  if (msg?.ok) return <div className="notice">{msg.tekst}</div>;
  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field"><label htmlFor="naam">Naam</label><input id="naam" name="naam" autoComplete="name" required minLength={2} /></div>
      <div className="field"><label htmlFor="email">E-mailadres</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="telefoon">Telefoonnummer (optioneel)</label><input id="telefoon" name="telefoon" type="tel" autoComplete="tel" /></div>
      <div className="field">
        <label htmlFor="rol">Functie</label>
        <select id="rol" name="rol" defaultValue="setter"><option value="setter">Setter (bellen en afspraken inplannen)</option><option value="sales">Salesmedewerker</option></select>
      </div>
      <div className="field"><label htmlFor="toelichting">Toelichting (optioneel)</label><textarea id="toelichting" name="toelichting" rows={3} maxLength={500} /></div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      {msg && <div className="alert">{msg.tekst}</div>}
      <button className="button" type="submit" disabled={busy}>{busy ? "Bezig…" : "Aanvraag versturen"}</button>
    </form>
  );
}
