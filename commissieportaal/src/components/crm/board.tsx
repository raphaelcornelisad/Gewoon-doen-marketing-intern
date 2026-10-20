"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, initialen, waLink } from "./icons";
import { FaseVenster } from "./acties";
import { post, QuickNote, Sheet, TagEditor } from "./sheet";

export interface BoardCard {
  id: string;
  contactId: string;
  fase: string;
  salon: string;
  sub: string;
  telefoon: string | null;
  behandelingen: string[];
  tags: string[];
  waarde: string | null;
  /** Eigenaar (outbound) of setter-tag (sales) */
  wie: { id: string; naam: string } | null;
  afspraak: string | null;
  belpogingen: number;
  /** Fase mag niet worden aangepast door deze gebruiker */
  vergrendeld: boolean;
  /** Gegevens (tags/notitie) mogen worden aangepast */
  bewerkbaar: boolean;
}

type Paneel = { soort: "fase" | "tags" | "notitie" | "eigenaar"; card: BoardCard } | null;

const MAX = 2000;

export function Board({
  pijplijn,
  fases,
  cards: initial,
  waardes,
  alleTags,
  setters,
  rol,
}: {
  pijplijn: "outbound" | "sales";
  fases: { key: string; label: string }[];
  cards: BoardCard[];
  waardes: Record<string, string>;
  alleTags: string[];
  setters: { id: string; naam: string }[] | null;
  rol: "admin" | "setter";
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [paneel, setPaneel] = useState<Paneel>(null);
  useEffect(() => setCards(initial), [initial]);

  async function move(id: string, fase: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.fase === fase) return;
    if (card.vergrendeld) return setFout(`${card.salon}: je kunt de fase van deze lead niet aanpassen.`);
    const vorige = cards;
    setCards(cards.map((c) => (c.id === id ? { ...c, fase } : c)));
    const r = await post(`/api/crm/opp/${id}`, { fase });
    if (!r.ok) {
      setCards(vorige);
      setFout(r.message ?? "Verplaatsen is mislukt.");
    } else {
      setFout(null);
      router.refresh();
    }
  }

  async function eigenaar(card: BoardCard, setterId: string | null) {
    const r =
      pijplijn === "sales"
          ? await post(`/api/crm/opp/${card.id}`, { setterId })
          : await post(`/api/crm/contact/${card.contactId}`, { eigenaar_id: setterId });
    if (!r.ok) setFout(r.message ?? "Mislukt.");
    setPaneel(null);
    router.refresh();
  }

  const sluit = () => setPaneel(null);

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
              <header className="crm-col__kop">
                <span className="crm-col__head"><span>{f.label}</span></span>
                <span className="crm-col__meta">
                  <span>{col.length} {col.length === 1 ? "lead" : "leads"}</span>
                  <span>{waardes[f.key] || "€ 0,00"}</span>
                </span>
              </header>
              <div className="crm-col__lijst">
              {col.slice(0, MAX).map((c) => {
                const wa = waLink(c.telefoon);
                const tel = c.telefoon?.replace(/[^\d+]/g, "");
                return (
                  <article key={c.id} className="crm-card" draggable={!c.vergrendeld} onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}>
                    <div className="crm-card__top">
                      <Link href={`/crm/lead/${c.contactId}`} className="crm-card__name">{c.salon}</Link>
                      {c.waarde && <span className="crm-card__value">{c.waarde}</span>}
                      <button
                        type="button"
                        className={`crm-avatar${c.wie ? "" : " crm-avatar--leeg"}`}
                        title={c.wie ? c.wie.naam : "Niet toegewezen"}
                        aria-label={c.wie ? `Eigenaar: ${c.wie.naam}` : "Niet toegewezen"}
                        onClick={() => setPaneel({ soort: "eigenaar", card: c })}
                      >
                        {c.wie ? initialen(c.wie.naam) : <Icon name="user" size={18} />}
                      </button>
                    </div>
                    <div className="crm-card__eigenaar">
                      <span className={`crm-label${c.wie ? "" : " crm-label--leeg"}`}>{c.wie ? c.wie.naam : pijplijn === "sales" ? "Geen setter" : "Niet toegewezen"}</span>
                    </div>
                    <Link href={`/crm/lead/${c.contactId}`} className="crm-card__body">
                      {c.sub && <span className="small muted">{c.sub}</span>}
                      {c.afspraak && <span className="small crm-card__actie">{c.afspraak}</span>}
                      {c.belpogingen > 0 && <span className="small muted">{c.belpogingen}× gebeld</span>}
                      {(c.behandelingen.length > 0 || c.tags.length > 0) && (
                        <span className="crm-chips">
                          {c.tags.map((t) => <span key={`t-${t}`} className="crm-chip crm-chip--tag">{t}</span>)}
                          {c.behandelingen.map((b) => <span key={b} className="crm-chip">{b}</span>)}
                        </span>
                      )}
                    </Link>
                    <div className="crm-card__actions">
                      {tel ? <a className="crm-iconbtn" href={`tel:${tel}`} aria-label="Bellen"><Icon name="phone" /></a> : <span className="crm-iconbtn is-off"><Icon name="phone" /></span>}
                      {wa ? <a className="crm-iconbtn" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp"><Icon name="chat" /></a> : <span className="crm-iconbtn is-off"><Icon name="chat" /></span>}
                      <button type="button" className="crm-iconbtn" aria-label={`Tags (${c.tags.length})`} disabled={!c.bewerkbaar} onClick={() => setPaneel({ soort: "tags", card: c })}>
                        <Icon name="tag" />
                        {c.tags.length > 0 && <span className="crm-badge">{c.tags.length}</span>}
                      </button>
                      <button type="button" className="crm-iconbtn" aria-label="Notitie" onClick={() => setPaneel({ soort: "notitie", card: c })}><Icon name="note" /></button>
                      <button type="button" className="crm-iconbtn crm-iconbtn--primair" aria-label="Fase wijzigen" disabled={c.vergrendeld} onClick={() => setPaneel({ soort: "fase", card: c })}>
                        <Icon name="move" />
                      </button>
                    </div>
                  </article>
                );
              })}
              {col.length > MAX && <span className="small muted">+ {col.length - MAX} meer. Gebruik de filters.</span>}
              </div>
            </section>
          );
        })}
      </div>

      {paneel?.soort === "fase" && <FaseVenster oppId={paneel.card.id} fase={paneel.card.fase} fases={fases} pijplijn={pijplijn} onSluit={sluit} />}
      {paneel?.soort === "tags" && (
        <Sheet titel={`Tags · ${paneel.card.salon}`} onClose={sluit}>
          <TagEditor contactId={paneel.card.contactId} tags={paneel.card.tags} alle={alleTags} />
        </Sheet>
      )}
      {paneel?.soort === "notitie" && (
        <Sheet titel={`Notitie · ${paneel.card.salon}`} onClose={sluit}>
          <QuickNote contactId={paneel.card.contactId} onDone={sluit} />
          <p className="small"><Link href={`/crm/lead/${paneel.card.contactId}`}>Alle notities bekijken →</Link></p>
        </Sheet>
      )}
      {paneel?.soort === "eigenaar" && (
        <Sheet titel={`${pijplijn === "sales" ? "Ingepland door" : "Eigenaar"} · ${paneel.card.salon}`} onClose={sluit}>
          <p style={{ marginTop: 0 }}>
            {paneel.card.wie ? <>{pijplijn === "sales" ? "Ingepland door" : "Opgepakt door"} <strong>{paneel.card.wie.naam}</strong>.</> : pijplijn === "sales" ? "Geen setter-tag." : "Deze lead is nog van niemand."}
          </p>
          {rol === "admin" && setters && (
            <div className="crm-sheet__list">
              {setters.map((s) => (
                <button key={s.id} type="button" className="crm-stage" aria-pressed={paneel.card.wie?.id === s.id} onClick={() => eigenaar(paneel.card, s.id)}>{s.naam}</button>
              ))}
              <button type="button" className="crm-stage" onClick={() => eigenaar(paneel.card, null)}>Niemand</button>
            </div>
          )}
          {rol === "setter" && pijplijn === "outbound" && !paneel.card.wie && (
            <>
              <p className="small muted" style={{ margin: 0 }}>Een lead wordt van jou na een geregistreerde belpoging.</p>
              <Link href={`/crm/bellen?lead=${paneel.card.contactId}`} className="button button--small">Deze lead bellen</Link>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
