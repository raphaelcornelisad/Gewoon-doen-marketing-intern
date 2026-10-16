"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Field = "naam" | "email" | "sheetUrl";

const NOT_PUBLIC_HINT = "Delen → Algemene toegang → Iedereen met de link → Lezer";

export function SubmitForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: Field } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/indienen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naam: form.get("naam"),
          email: form.get("email"),
          sheetUrl: form.get("sheetUrl"),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        router.push("/bedankt");
        return;
      }
      setError({ message: data?.message ?? "Er ging iets mis. Probeer het opnieuw.", field: data?.field });
    } catch {
      setError({ message: "Geen verbinding. Controleer je internet en probeer het opnieuw." });
    }
    setBusy(false);
  }

  const invalid = (f: Field) => (error?.field === f ? true : undefined);
  const isNotPublic = error?.message.includes("Iedereen met de link");

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error && !error.field && (
        <div className="alert" role="alert">
          {error.message}
        </div>
      )}

      <div className="field">
        <label htmlFor="naam">Naam</label>
        <input id="naam" name="naam" autoComplete="name" required aria-invalid={invalid("naam")} />
        {error?.field === "naam" && <span className="field-error">{error.message}</span>}
      </div>

      <div className="field">
        <label htmlFor="email">E-mailadres</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
          aria-invalid={invalid("email")}
        />
        {error?.field === "email" && <span className="field-error">{error.message}</span>}
      </div>

      <div className="field">
        <label htmlFor="sheetUrl">Link naar Google Sheet</label>
        <input
          id="sheetUrl"
          name="sheetUrl"
          type="url"
          inputMode="url"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          autoComplete="off"
          required
          aria-invalid={invalid("sheetUrl")}
        />
        {error?.field === "sheetUrl" &&
          (isNotPublic ? (
            <div className="alert" role="alert">
              <strong>Je sheet is niet openbaar</strong>
              Open je sheet en zet het delen aan:
              <ol className="steps">
                {NOT_PUBLIC_HINT.split(" → ").map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              Dien daarna opnieuw in.
            </div>
          ) : (
            <span className="field-error">{error.message}</span>
          ))}
        {!isNotPublic && <span className="hint">Tip: deel je sheet via {NOT_PUBLIC_HINT}.</span>}
      </div>

      <button className="button" type="submit" disabled={busy}>
        {busy ? "Bezig met controleren…" : "Indienen"}
      </button>
    </form>
  );
}
