"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, initialen, waLink } from "./icons";
import { FaseVenster, TaakVenster } from "./acties";
import { BelKnop } from "./bel-knop";
import { NotitiePaneel } from "./notitie-paneel";
import { post, Sheet, TagEditor } from "./sheet";

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
  notities: number;
  /** Open taken */
  taken: number;
  laatsteNotitie: { tekst: string; door: string | null; created_at: string } | null;
  /** Fase mag niet worden aangepast door deze gebruiker */
  vergrendeld: boolean;
  /** Gegevens (tags/notitie) mogen worden aangepast */
  bewerkbaar: boolean;
}

type Paneel = { soort: "fase" | "tags" | "notitie" | "taak" | "eigenaar"; card: BoardCard } | null;

const MAX = 2000;

export function Board({
  pijplijn,
  fases,
  cards: initial,
  waardes,
  alleTags,
  setters,
  rol,
  mijnId = null,
}: {
  pijplijn: "outbound" | "sales";
  fases: { key: string; label: string }[];
  cards: BoardCard[];
  waardes: Record<string, string>;
  alleTags: string[];
  setters: { id: string; naam: string }[] | null;
  rol: "admin" | "setter";
  /** Eigen setter-id (alleen voor setters): om een vrije lead zelf op te pakken */
  mijnId?: string | null;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [preview, setPreview] = useState<{ card: BoardCard; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!preview) return;
    const weg = () => setPreview(null);
    window.addEventListener("scroll", weg, true);
    return () => window.removeEventListener("scroll", weg, true);
  }, [preview]);
  const toonPreview = (c: BoardCard, el: HTMLElement) => {
    if (!c.laatsteNotitie || sleep.current?.actief) return;
    const r = el.getBoundingClientRect();
    const breedte = 300;
    setPreview({ card: c, x: Math.max(8, Math.min(r.left + r.width / 2 - breedte / 2, window.innerWidth - breedte - 8)), y: r.top });
  };
  useEffect(() => setCards(initial), [initial]);

  // ---- Slepen met de muis: linkerknop ingedrukt houden op een kaart en naar een andere fase trekken ----
  const boardRef = useRef<HTMLDivElement>(null);
  const sleep = useRef<{ id: string; x: number; y: number; dx: number; dy: number; actief: boolean; breedte: number } | null>(null);
  const netGesleept = useRef(false);
  const [ghost, setGhost] = useState<{ card: BoardCard; x: number; y: number; breedte: number } | null>(null);

  useEffect(() => {
    let scroll = 0;
    const faseOnder = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-fase]") as HTMLElement | null)?.dataset.fase ?? null;
    const autoScroll = (x: number, y: number) => {
      const b = boardRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const rand = 80;
      const h = x < r.left + rand ? -18 : x > r.right - rand ? 18 : 0;
      if (h) b.scrollLeft += h;
      const lijst = (document.elementFromPoint(x, y)?.closest(".crm-col") as HTMLElement | null)?.querySelector(".crm-col__lijst") as HTMLElement | null;
      if (lijst) {
        const lr = lijst.getBoundingClientRect();
        if (y < lr.top + 50) lijst.scrollTop -= 14;
        else if (y > lr.bottom - 50) lijst.scrollTop += 14;
      }
    };
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
      cancelAnimationFrame(scroll);
      const lus = () => {
        autoScroll(e.clientX, e.clientY);
        scroll = requestAnimationFrame(lus);
      };
      scroll = requestAnimationFrame(lus);
    };
    const los = (e: PointerEvent) => {
      const s = sleep.current;
      sleep.current = null;
      cancelAnimationFrame(scroll);
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
      cancelAnimationFrame(scroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  function pakOp(e: React.PointerEvent<HTMLElement>, c: BoardCard) {
    if (e.button !== 0 || e.pointerType === "touch") return; // aanraakscherm: knop "Fase wijzigen"
    if ((e.target as HTMLElement).closest("button, .crm-card__actions a")) return; // actieknoppen blijven klikbaar
    if (c.vergrendeld) return setFout(`${c.salon}: je kunt de fase van deze lead niet aanpassen.`);
    const r = e.currentTarget.getBoundingClientRect();
    sleep.current = { id: c.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, actief: false, breedte: r.width };
  }

  async function move(id: string, fase: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.fase === fase) return;
    if (card.vergrendeld) return setFout(`${card.salon}: je kunt de fase van deze lead niet aanpassen.`);
    if (pijplijn === "sales" && (fase === "offerte" || fase === "geaccepteerd")) return setPaneel({ soort: "fase", card }); // vraagt verplichte gegevens
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
      <div className="crm-board" ref={boardRef}>
        {fases.map((f) => {
          const col = cards.filter((c) => c.fase === f.key);
          return (
            <section key={f.key} data-fase={f.key} className={`crm-col${over === f.key ? " crm-col--over" : ""}`}>
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
                  <article
                    key={c.id}
                    className={`crm-card${ghost?.card.id === c.id ? " crm-card--weg" : ""}${c.vergrendeld ? "" : " crm-card--sleepbaar"}`}
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
                      {c.tags.length > 0 && (
                        <span className="crm-chips">
                          {c.tags.map((t) => <span key={`t-${t}`} className="crm-chip crm-chip--tag">{t}</span>)}
                        </span>
                      )}
                    </Link>
                    <div className="crm-card__actions">
                      {tel ? <BelKnop className="crm-iconbtn" telefoon={tel} salon={c.salon}><Icon name="phone" /></BelKnop> : <span className="crm-iconbtn is-off"><Icon name="phone" /></span>}
                      {wa ? <Link className="crm-iconbtn" href={`/crm/inbox?lead=${c.contactId}`} aria-label="Chat openen"><Icon name="chat" /></Link> : <span className="crm-iconbtn is-off"><Icon name="chat" /></span>}
                      <button type="button" className="crm-iconbtn" aria-label={`Taak toevoegen (${c.taken} open)`} onClick={() => setPaneel({ soort: "taak", card: c })}>
                        <Icon name="taak" />
                        {c.taken > 0 && <span className="crm-badge">{c.taken}</span>}
                      </button>
                      <button
                        type="button"
                        className="crm-iconbtn"
                        aria-label={`Notities (${c.notities})`}
                        onClick={() => { setPreview(null); setPaneel({ soort: "notitie", card: c }); }}
                        onPointerEnter={(e) => e.pointerType === "mouse" && toonPreview(c, e.currentTarget)}
                        onPointerLeave={() => setPreview(null)}
                        onFocus={(e) => toonPreview(c, e.currentTarget)}
                        onBlur={() => setPreview(null)}
                      >
                        <Icon name="note" />
                        {c.notities > 0 && <span className="crm-badge">{c.notities}</span>}
                      </button>
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

      {ghost && (
        <div className="crm-card crm-card--ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.breedte }} aria-hidden="true">
          <div className="crm-card__top">
            <strong className="crm-card__name">{ghost.card.salon}</strong>
            {ghost.card.waarde && <span className="crm-card__value">{ghost.card.waarde}</span>}
          </div>
          <div className="crm-card__body">{ghost.card.sub && <span className="small muted">{ghost.card.sub}</span>}</div>
        </div>
      )}
      {preview?.card.laatsteNotitie && (
        <div className="crm-notitie-preview" role="tooltip" style={{ left: preview.x, top: preview.y }}>
          <span className="small muted">
            Laatste notitie{preview.card.notities > 1 ? ` (van ${preview.card.notities})` : ""} ·{" "}
            {new Date(preview.card.laatsteNotitie.created_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {preview.card.laatsteNotitie.door ? ` · ${preview.card.laatsteNotitie.door.split("@")[0]}` : ""}
          </span>
          <p>{preview.card.laatsteNotitie.tekst.replace(/^\[Uit de lijst\]\s*/, "")}</p>
        </div>
      )}
      {paneel?.soort === "fase" && <FaseVenster oppId={paneel.card.id} fase={paneel.card.fase} fases={fases} pijplijn={pijplijn} onSluit={sluit} />}
      {paneel?.soort === "tags" && (
        <Sheet titel={`Tags · ${paneel.card.salon}`} onClose={sluit}>
          <TagEditor contactId={paneel.card.contactId} tags={paneel.card.tags} alle={alleTags} />
        </Sheet>
      )}
      {paneel?.soort === "taak" && <TaakVenster contactId={paneel.card.contactId} onSluit={sluit} />}
      {paneel?.soort === "notitie" && (
        <NotitiePaneel contactId={paneel.card.contactId} titel={`Notitie · ${paneel.card.salon}`} onSluit={sluit} />
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
          {rol === "setter" && pijplijn === "outbound" && !paneel.card.wie && mijnId && (
            <>
              <button type="button" className="button" onClick={() => eigenaar(paneel.card, mijnId)}>Mezelf toevoegen als eigenaar</button>
              <Link href={`/crm/bellen?lead=${paneel.card.contactId}`} className="button button--small button--ghost">Deze lead bellen</Link>
            </>
          )}
          {rol === "setter" && pijplijn === "outbound" && mijnId && paneel.card.wie?.id === mijnId && (
            <button type="button" className="button button--small button--ghost" onClick={() => eigenaar(paneel.card, null)}>Lead vrijgeven</button>
          )}
        </Sheet>
      )}
    </>
  );
}
