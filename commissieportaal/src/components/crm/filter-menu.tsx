"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface FilterGroep {
  key: string;
  label: string;
  opties: { value: string; label: string }[];
}

/** Eén knop "Filteren": klapt uit met categorieën; een keuze filtert direct. */
export function FilterMenu({ action, query, groepen }: { action: string; query: Record<string, string | undefined>; groepen: FilterGroep[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groep, setGroep] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const weg = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", weg);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", weg);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const naar = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    router.push(s ? `${action}?${s}` : action);
  };
  const actief = groepen.filter((g) => query[g.key]);
  const huidige = groepen.find((g) => g.key === groep);
  const z = zoek.trim().toLowerCase();

  return (
    <div className="fm" ref={ref}>
      <button type="button" className={`fm-knop${actief.length ? " is-actief" : ""}`} aria-expanded={open} onClick={() => { setOpen(!open); setGroep(null); setZoek(""); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        Filteren{actief.length ? <span className="fm-aantal">{actief.length}</span> : null}
      </button>
      {actief.map((g) => (
        <button key={g.key} type="button" className="fm-chip" onClick={() => naar({ [g.key]: undefined })} aria-label={`Filter ${g.label} verwijderen`}>
          {g.opties.find((o) => o.value === query[g.key])?.label ?? query[g.key]} <span aria-hidden="true">×</span>
        </button>
      ))}
      {open && (
        <div className="fm-paneel" role="dialog" aria-label="Filteren">
          {!huidige ? (
            <ul className="fm-lijst">
              {groepen.map((g) => (
                <li key={g.key}>
                  <button type="button" onClick={() => { setGroep(g.key); setZoek(""); }}>
                    <span>{g.label}</span>
                    <span className="fm-waarde">{query[g.key] ? (g.opties.find((o) => o.value === query[g.key])?.label ?? query[g.key]) : ""} ›</span>
                  </button>
                </li>
              ))}
              {actief.length > 0 && (
                <li className="fm-wis"><button type="button" onClick={() => { setOpen(false); naar(Object.fromEntries(groepen.map((g) => [g.key, undefined]))); }}>Alle filters wissen</button></li>
              )}
            </ul>
          ) : (
            <>
              <div className="fm-kop">
                <button type="button" className="fm-terug" onClick={() => setGroep(null)}>‹ Filters</button>
                <strong>{huidige.label}</strong>
              </div>
              {huidige.opties.length > 8 && <input className="fm-zoek" autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={`Zoek ${huidige.label.toLowerCase()}`} aria-label={`Zoek ${huidige.label}`} />}
              <ul className="fm-lijst fm-lijst--opties">
                <li>
                  <button type="button" onClick={() => { setOpen(false); naar({ [huidige.key]: undefined }); }}>
                    <span>Alle</span>{!query[huidige.key] && <span className="fm-vink">✓</span>}
                  </button>
                </li>
                {huidige.opties.filter((o) => !z || o.label.toLowerCase().includes(z)).map((o) => (
                  <li key={o.value}>
                    <button type="button" onClick={() => { setOpen(false); naar({ [huidige.key]: o.value }); }}>
                      <span>{o.label}</span>{query[huidige.key] === o.value && <span className="fm-vink">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
