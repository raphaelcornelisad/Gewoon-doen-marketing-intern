"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./sheet";

export function ReviewActies({ id, soort, setters }: { id: string; soort: string; setters: { id: string; naam: string }[] }) {
  const router = useRouter();
  const [setter, setSetter] = useState("");
  const [contact, setContact] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const doe = async (body: Record<string, unknown>) => {
    const r = await post(`/api/crm/review/${id}`, body);
    if (!r.ok) return setFout(r.message ?? "Mislukt.");
    router.refresh();
  };
  const setterSelect = (
    <select value={setter} onChange={(e) => setSetter(e.target.value)} aria-label="Setter">
      <option value="">Geen setter (geen commissie)</option>
      {setters.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
    </select>
  );
  return (
    <div className="inline-form__row">
      {soort === "duplicaat" && (
        <>
          <button type="button" className="button button--small" onClick={() => doe({ actie: "samenvoegen" })}>Nieuwe lead verwijderen (dubbel)</button>
          <button type="button" className="button button--small button--ghost" onClick={() => doe({ actie: "houden" })}>Beide houden</button>
        </>
      )}
      {soort === "attributie" && (
        <>
          {setterSelect}
          <button type="button" className="button button--small" onClick={() => doe({ actie: "setter", setterId: setter || null })}>Vastleggen</button>
        </>
      )}
      {soort === "boeking_zonder_lead" && (
        <>
          {setterSelect}
          <button type="button" className="button button--small" onClick={() => doe({ actie: "nieuw", setterId: setter || null })}>Als nieuwe lead aanmaken</button>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="of lead-ID van bestaande lead" aria-label="Lead-ID" />
          <button type="button" className="button button--small button--ghost" disabled={!contact} onClick={() => doe({ actie: "koppelen", contactId: contact, setterId: setter || null })}>Koppelen</button>
          <button type="button" className="linkbutton" onClick={() => doe({ actie: "negeren" })}>Negeren (geen CRM-lead)</button>
        </>
      )}
      {fout && <span className="small field-error">{fout}</span>}
    </div>
  );
}
