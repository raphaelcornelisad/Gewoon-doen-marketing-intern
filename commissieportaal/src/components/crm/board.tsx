"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface BoardCard {
  id: string;
  contactId: string;
  fase: string;
  salon: string;
  sub: string;
  behandelingen: string[];
  waarde: string | null;
  tag: string | null;
  afspraak: string | null;
  vergrendeld: boolean;
}

const MAX = 100;

export function Board({ fases, cards: initial, waardes }: { fases: { key: string; label: string }[]; cards: BoardCard[]; waardes: Record<string, string> }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  useEffect(() => setCards(initial), [initial]);

  async function move(id: string, fase: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.fase === fase) return;
    if (card.vergrendeld) return setFout(`${card.salon} is opgepakt door een andere setter.`);
    const vorige = cards;
    setCards(cards.map((c) => (c.id === id ? { ...c, fase } : c)));
    const res = await fetch(`/api/crm/opp/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fase }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.ok) {
      setCards(vorige);
      setFout(data?.message ?? "Verplaatsen is mislukt.");
    } else {
      setFout(null);
      router.refresh();
    }
  }

  return (
    <>
      {fout && <div className="alert" role="alert">{fout}</div>}
      <div className="crm-board">
        {fases.map((f) => {
          const col = cards.filter((c) => c.fase === f.key);
          return (
            <section
              key={f.key}
              className={`crm-col${over === f.key ? " crm-col--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(f.key);
              }}
              onDragLeave={() => setOver((o) => (o === f.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/plain"), f.key);
              }}
            >
              <header className="crm-col__head">
                <span>{f.label}</span>
                <span className="muted">{col.length}</span>
              </header>
              {waardes[f.key] && <span className="small muted">{waardes[f.key]}</span>}
              {col.slice(0, MAX).map((c) => (
                <Link
                  key={c.id}
                  href={`/crm/lead/${c.contactId}`}
                  className={`crm-card${c.vergrendeld ? " crm-card--locked" : ""}`}
                  draggable={!c.vergrendeld}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                >
                  <span className="crm-card__top">
                    <strong>{c.salon}</strong>
                    {c.waarde && <span className="crm-card__value">{c.waarde}</span>}
                  </span>
                  {c.sub && <span className="small muted">{c.sub}</span>}
                  {c.afspraak && <span className="small">📅 {c.afspraak}</span>}
                  {(c.behandelingen.length > 0 || c.tag) && (
                    <span className="crm-chips">
                      {c.tag && <span className="crm-chip crm-chip--tag">{c.tag}</span>}
                      {c.behandelingen.map((b) => (
                        <span key={b} className="crm-chip">{b}</span>
                      ))}
                    </span>
                  )}
                </Link>
              ))}
              {col.length > MAX && <span className="small muted">+ {col.length - MAX} meer. Gebruik de filters.</span>}
            </section>
          );
        })}
      </div>
    </>
  );
}
