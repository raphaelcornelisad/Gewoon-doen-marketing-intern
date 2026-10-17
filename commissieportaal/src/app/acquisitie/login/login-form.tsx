"use client";

import { useState } from "react";

export function AcqLoginForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const email = new FormData(e.currentTarget).get("email");
    const res = await fetch("/api/acquisitie/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setMsg(data?.message ?? "Er ging iets mis. Probeer het opnieuw.");
    setBusy(false);
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="email">E-mailadres</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {msg && <div className="alert">{msg}</div>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Bezig…" : "Stuur inloglink"}
      </button>
    </form>
  );
}
