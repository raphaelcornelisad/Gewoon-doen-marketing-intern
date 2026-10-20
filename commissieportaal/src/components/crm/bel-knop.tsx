"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "./sheet";

const leesbaar = (tel: string) => (tel.startsWith("+31") ? `0${tel.slice(3)}`.replace(/^(06)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5") : tel);

/**
 * Belknop: op een telefoon opent direct de belfunctie (tel:). Op een computer verschijnt het nummer groot,
 * met bellen (via gekoppelde telefoon/FaceTime) en kopiëren.
 */
export function BelKnop({ telefoon, salon, className, label, children }: { telefoon: string; salon?: string; className: string; label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const href = `tel:${telefoon}`;
  return (
    <>
      <a
        className={className}
        href={href}
        aria-label={label ?? "Bellen"}
        onClick={(e) => {
          if (window.matchMedia("(pointer: fine)").matches) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </a>
      {open && createPortal(
        // Los van de kaart (slepen, scrollen) zodat klikken in het venster niets anders in gang zet.
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <Sheet titel={salon ? `Bellen · ${salon}` : "Bellen"} onClose={() => setOpen(false)}>
          <div className="crm-bel">
            <a className="crm-bel__nummer" href={href}>{leesbaar(telefoon)}</a>
            <div className="crm-bel__knoppen">
              <a className="button button--small" href={href}>Bellen</a>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={async () => {
                  await navigator.clipboard?.writeText(telefoon).catch(() => null);
                  setGekopieerd(true);
                  setTimeout(() => setGekopieerd(false), 2000);
                }}
              >
                {gekopieerd ? "Gekopieerd ✓" : "Nummer kopiëren"}
              </button>
            </div>
            <span className="small muted">Bellen opent de belfunctie van je computer (bijv. via je gekoppelde iPhone of Telefoonkoppeling). Op je telefoon belt deze knop direct.</span>
          </div>
        </Sheet>
        </div>,
        document.body,
      )}
    </>
  );
}
