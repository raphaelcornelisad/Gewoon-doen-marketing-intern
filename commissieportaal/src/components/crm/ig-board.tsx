"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { duurTekst, instagramLink, kortBericht, wachtMinuten } from "@/lib/ig/core";
import { Icon, initialen } from "./icons";
import { post, Sheet } from "./sheet";

export interface IgCard {
  id: string;
  fase: string;
  gebruikersnaam: string | null;
  laatsteTekst: string | null;
  laatsteVan: "wij" | "lead" | null;
  laatsteOp: string | null;
  wachtSinds: string | null;
  handmatig: boolean;
  bestaandeKlant: boolean;
}

const MAX = 500;
const kort = (iso: string | null) => (iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Kanbanbord voor Instagram-gesprekken, in de stijl van het CRM-bord. Slepen zet de fase handmatig. */
export function IgBoard({ fases, cards: initial, bewerkbaar, nuIso }: { fases: { key: string; label: string }[]; cards: IgCard[]; bewerkbaar: boolean; /** Tijd van de server-render, zodat server en browser dezelfde wachttijd tonen */ nuIso: string }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [kies, setKies] = useState<IgCard | null>(null);
  const [nu, setNu] = useState(() => new Date(nuIso));
  useEffect(() => setCards(initial), [initial]);
  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const sleep = useRef<{ id: string; x: number; y: number; dx: number; dy: number; actief: boolean; breedte: number } | null>(null);
  const netGesleept = useRef(false);
  const [ghost, setGhost] = useState<{ card: IgCard; x: number; y: number; breedte: number } | null>(null);

  useEffect(() => {
    const faseOnder = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-fase]") as HTMLElement | null)?.dataset.fase ?? null;
    const beweeg = (e: PointerEvent) => {
      const s = sleep.current;
      if (!s) return;
      if (!s.actief) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
        s.actief = true;
        document.body.classList.add("crm-sleept");
      }
      e.preventDefault();
      const card = cards.find((c) => c.id === s.id);
      if (card) setGhost({ card, x: e.clientX - s.dx, y: e.clientY - s.dy, breedte: s.breedte });
      setOver(faseOnder(e.clientX, e.clientY));
    };
    const los = (e: PointerEvent) => {
      const s = sleep.current;
      sleep.current = null;
      document.body.classList.remove("crm-sleept");
      if (!s?.actief) return;
      netGesleept.current = true;
      setTimeout(() => (netGesleept.current = false), 50);
      const doel = faseOnder(e.clientX, e.clientY);
      setGhost(null);
      setOver(null);
      if (doel) void move(s.id, doel);
    };
    window.addEventListener("pointermove", beweeg, { passive: false });
    window.addEventListener("pointerup", los);
    window.addEventListener("pointercancel", los);
    return () => {
      window.removeEventListener("pointermove", beweeg);
      window.removeEventListener("pointerup", los);
      window.removeEventListener("pointercancel", los);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  function pakOp(e: React.PointerEvent<HTMLElement>, c: IgCard) {
    if (!bewerkbaar || e.button !== 0 || e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    const r = e.currentTarget.getBoundingClientRect();
    sleep.current = { id: c.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, actief: false, breedte: r.width };
  }

  async function move(id: string, fase: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.fase === fase || !bewerkbaar) return;
    const vorige = cards;
    setCards(cards.map((c) => (c.id === id ? { ...c, fase, handmatig: true } : c)));
    const r = await post(`/api/crm/ig/${id}`, { fase });
    if (!r.ok) {
      setCards(vorige);
      setFout(r.message ?? "Verplaatsen is mislukt.");
    } else {
      setFout(null);
      router.refresh();
    }
  }

  const naam = (c: IgCard) => (c.gebruikersnaam ? `@${c.gebruikersnaam}` : "Onbekend");

  return (
    <>
      {fout && <div className="alert" role="alert">{fout}</div>}
      <div className="crm-board">
        {fases.map((f) => {
          const col = cards.filter((c) => c.fase === f.key);
          const wachtend = col.filter((c) => wachtMinuten(c.wachtSinds, nu) !== null).length;
          return (
            <section key={f.key} data-fase={f.key} className={`crm-col${over === f.key ? " crm-col--over" : ""}`}>
              <header className="crm-col__kop">
                <span className="crm-col__head"><span>{f.label}</span></span>
                <span className="crm-col__meta">
                  <span>{col.length} {col.length === 1 ? "gesprek" : "gesprekken"}</span>
                  <span>{wachtend ? `${wachtend} wacht op ons` : ""}</span>
                </span>
              </header>
              <div className="crm-col__lijst">
                {col.slice(0, MAX).map((c) => {
                  const wacht = wachtMinuten(c.wachtSinds, nu);
                  return (
                    <article
                      key={c.id}
                      className={`crm-card${ghost?.card.id === c.id ? " crm-card--weg" : ""}${bewerkbaar ? " crm-card--sleepbaar" : ""}`}
                      onPointerDown={(e) => pakOp(e, c)}
                      onClickCapture={(e) => {
                        if (netGesleept.current) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      <div className="crm-card__top">
                        <strong className="crm-card__name">{naam(c)}</strong>
                        <span className="crm-avatar" aria-hidden="true">{initialen(c.gebruikersnaam ?? "?")}</span>
                      </div>
                      <div className="crm-card__body">
                        {(wacht !== null || c.bestaandeKlant || c.handmatig) && (
                          <span className="crm-chips">
                            {wacht !== null && <span className="crm-chip crm-chip--rood" title={`Laatste bericht van de lead: ${kort(c.wachtSinds)}`}>Wacht op ons · {duurTekst(wacht)}</span>}
                            {c.bestaandeKlant && <span className="crm-chip crm-chip--ok">Bestaande klant</span>}
                            {c.handmatig && <span className="crm-chip" title="Fase met de hand gezet; de sync past hem niet meer aan">Handmatig</span>}
                          </span>
                        )}
                        {c.laatsteTekst ? (
                          <span className="small">{c.laatsteVan === "wij" ? "Wij: " : ""}{kortBericht(c.laatsteTekst)}</span>
                        ) : (
                          <span className="small muted">Geen tekst</span>
                        )}
                        {c.laatsteOp && <span className="small muted">{kort(c.laatsteOp)}</span>}
                      </div>
                      <div className="crm-card__actions">
                        <a className="crm-iconbtn" href={instagramLink(c.gebruikersnaam)} target="_blank" rel="noopener noreferrer" aria-label="Open in Instagram" title="Open in Instagram">
                          <Icon name="chat" />
                        </a>
                        <a className="small" href={instagramLink(c.gebruikersnaam)} target="_blank" rel="noopener noreferrer">Open in Instagram</a>
                        {bewerkbaar && (
                          <button type="button" className="crm-iconbtn crm-iconbtn--primair" aria-label="Fase wijzigen" onClick={() => setKies(c)}>
                            <Icon name="move" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {col.length > MAX && <span className="small muted">+ {col.length - MAX} meer.</span>}
              </div>
            </section>
          );
        })}
      </div>

      {ghost && (
        <div className="crm-card crm-card--ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.breedte }} aria-hidden="true">
          <div className="crm-card__top"><strong className="crm-card__name">{naam(ghost.card)}</strong></div>
          <div className="crm-card__body"><span className="small muted">{kortBericht(ghost.card.laatsteTekst)}</span></div>
        </div>
      )}
      {kies && (
        <Sheet titel={`Fase · ${naam(kies)}`} onClose={() => setKies(null)}>
          <div className="crm-sheet__list">
            {fases.map((f) => (
              <button
                key={f.key}
                type="button"
                className="crm-stage"
                aria-pressed={kies.fase === f.key}
                onClick={() => {
                  const c = kies;
                  setKies(null);
                  void move(c.id, f.key);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
