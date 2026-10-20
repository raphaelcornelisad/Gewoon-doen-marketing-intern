"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./sheet";

export function AanvraagKnoppen({ id, rol: start }: { id: string; rol: string }) {
  const router = useRouter();
  const [rol, setRol] = useState(start);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const doe = async (goed: boolean) => {
    if (!goed && !confirm("Aanvraag afwijzen?")) return;
    setBezig(true);
    const r = await post(`/api/crm/aanvragen/${id}`, { goed, rol });
    setBezig(false);
    if (!r.ok) return setFout(r.message ?? "Mislukt.");
    router.refresh();
  };
  return (
    <div className="crm-aanvraag__knoppen">
      <select value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Rol">
        <option value="setter">Setter</option>
        <option value="sales">Salesmedewerker</option>
      </select>
      <button type="button" className="button button--small" disabled={bezig} onClick={() => void doe(true)}>Goedkeuren</button>
      <button type="button" className="button button--small button--ghost" disabled={bezig} onClick={() => void doe(false)}>Afwijzen</button>
      {fout && <span className="small field-error">{fout}</span>}
    </div>
  );
}
