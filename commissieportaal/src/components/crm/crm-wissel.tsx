"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./sheet";

/** Keuzeknop bovenin: schakelen tussen CRM's, en (admin) een nieuw CRM aanmaken. */
export function CrmWissel({ huidig, lijst, magMaken }: { huidig: { id: string; naam: string }; lijst: { id: string; naam: string }[]; magMaken: boolean }) {
  const router = useRouter();
  const [maken, setMaken] = useState(false);
  const [naam, setNaam] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const klaar = (el: HTMLElement) => {
    el.closest("details")?.removeAttribute("open");
    router.push(location.pathname.startsWith("/crm/lead/") ? "/crm/outbound" : location.pathname + location.search);
    router.refresh();
  };

  return (
    <details className="crm-menu crm-wissel">
      <summary title="Wissel van CRM">{huidig.naam}</summary>
      <div className="crm-menu__lijst crm-menu__lijst--links">
        <span className="small muted crm-menu__email">Wissel van CRM</span>
        {lijst.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`linkbutton${w.id === huidig.id ? " is-actief" : ""}`}
            aria-current={w.id === huidig.id ? "true" : undefined}
            onClick={async (e) => {
              const el = e.currentTarget;
              if (w.id !== huidig.id) await post("/api/crm/werkruimte", { id: w.id });
              klaar(el);
            }}
          >
            {w.id === huidig.id ? "✓ " : ""}{w.naam}
          </button>
        ))}
        {magMaken && (
          <div className="crm-menu__voet">
            {maken ? (
              <form
                className="crm-wissel__form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const el = e.currentTarget;
                  setBezig(true);
                  setFout(null);
                  const r = await post("/api/crm/werkruimte", { naam });
                  setBezig(false);
                  if (r.ok) {
                    setNaam("");
                    setMaken(false);
                    klaar(el);
                  } else if (r.message?.includes("vergrendeld")) {
                    router.push(`/crm/beheer?next=${encodeURIComponent(location.pathname)}`);
                  } else setFout(r.message ?? "Aanmaken mislukt.");
                }}
              >
                <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam, bijv. Huidverbetering" maxLength={60} aria-label="Naam van het nieuwe CRM" />
                <button type="submit" className="button button--small" disabled={bezig || naam.trim().length < 2}>Aanmaken</button>
                {fout && <span className="small field-error">{fout}</span>}
              </form>
            ) : (
              <button type="button" className="linkbutton" onClick={() => setMaken(true)}>+ Nieuw CRM</button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
