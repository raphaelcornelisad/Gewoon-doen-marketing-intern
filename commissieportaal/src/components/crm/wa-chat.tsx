"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KanaalBeslissing } from "@/lib/crm/kanaal";
import { avatarKleur, initialen, waLink } from "./icons";
import { post } from "./sheet";

export interface WaGesprek {
  id: string;
  naam: string;
  laatste: string;
  richting: "in" | "uit";
  status: string;
  tijd: string;
  open: number;
}


export function Vinkjes({ status }: { status: string }) {
  if (status === "wachtrij") return <span className="wa-vink" title="In wachtrij">🕓</span>;
  if (status === "mislukt") return <span className="wa-vink wa-vink--fout" title="Mislukt">!</span>;
  if (status === "handmatig") return <span className="wa-vink" title="Via eigen WhatsApp-app geopend (niet gecontroleerd)">↗</span>;
  if (status === "verzonden") return <span className="wa-vink" title="Verzonden">✓</span>;
  if (status === "afgeleverd") return <span className="wa-vink" title="Afgeleverd">✓✓</span>;
  if (status === "gelezen") return <span className="wa-vink wa-vink--gelezen" title="Gelezen">✓✓</span>;
  return null;
}

/** Lijst met chats, met zoeken en een filter op ongelezen. */
export function WaLijst({ gesprekken, actief }: { gesprekken: WaGesprek[]; actief: string | null }) {
  const [q, setQ] = useState("");
  const [ongelezen, setOngelezen] = useState(false);
  const z = q.trim().toLowerCase();
  const lijst = gesprekken.filter((g) => (!ongelezen || g.open > 0) && (!z || g.naam.toLowerCase().includes(z) || g.laatste.toLowerCase().includes(z)));
  return (
    <>
      <div className="wa-zoek">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoeken" aria-label="Chats zoeken" />
        <div className="wa-filters">
          <button type="button" className={!ongelezen ? "is-actief" : undefined} onClick={() => setOngelezen(false)}>Alle</button>
          <button type="button" className={ongelezen ? "is-actief" : undefined} onClick={() => setOngelezen(true)}>Ongelezen</button>
        </div>
      </div>
      <div className="wa-chats">
        {lijst.length === 0 && <p className="wa-leeg">{gesprekken.length ? "Geen chats gevonden." : "Nog geen gesprekken. Open een lead en stuur een bericht om te beginnen."}</p>}
        {lijst.map((g) => (
          <Link key={g.id} href={`/crm/inbox?lead=${g.id}`} className={`wa-chat${actief === g.id ? " is-actief" : ""}`} aria-current={actief === g.id ? "page" : undefined}>
            <span className="wa-avatar" style={{ background: avatarKleur(g.id) }}>{initialen(g.naam)}</span>
            <span className="wa-chat__midden">
              <span className="wa-chat__rij">
                <strong>{g.naam}</strong>
                <span className={`wa-chat__tijd${g.open ? " is-nieuw" : ""}`}>{g.tijd}</span>
              </span>
              <span className="wa-chat__rij">
                <span className="wa-chat__laatste">
                  {g.richting === "uit" && <Vinkjes status={g.status} />} {g.laatste}
                </span>
                {g.open > 0 && <span className="wa-teller">{g.open}</span>}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Houdt het gesprek onderaan (nieuwste bericht in beeld), ook na verversen. */
export function WaScroll({ sleutel, children }: { sleutel: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sleutel]);
  return (
    <div ref={ref} className="wa-berichten">
      {children}
    </div>
  );
}

type Check = { beslissing: KanaalBeslissing; templates: { id: string; naam: string; goedgekeurd: boolean }[]; templateId: string | null; tekst: string; telefoon: string | null };

/** Invoerbalk onderaan. Via Twilio als dat mag; anders een template, of openen in de eigen WhatsApp-app. */
export function WaInvoer({ contactId, uit }: { contactId: string; uit: boolean }) {
  const router = useRouter();
  const [kanaal, setKanaal] = useState<"whatsapp" | "sms">("whatsapp");
  const [c, setC] = useState<Check | null>(null);
  const [tekst, setTekst] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const veld = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let weg = false;
    const qs = new URLSearchParams({ contactId, kanaal, ...(templateId ? { templateId } : {}) });
    fetch(`/api/crm/bericht/check?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (weg || !d?.ok) return;
        setC(d as Check);
        if ((d as Check).beslissing.api.modus === "template") setTekst((d as Check).tekst);
      })
      .catch(() => null);
    return () => {
      weg = true;
    };
  }, [contactId, kanaal, templateId]);

  useEffect(() => {
    const el = veld.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [tekst]);

  if (uit) return <div className="wa-invoer wa-invoer--uit">Deze lead staat op niet meer benaderen. Berichten sturen is uitgeschakeld.</div>;
  if (!c) return <div className="wa-invoer wa-invoer--uit">Laden…</div>;

  const b = c.beslissing;
  const template = b.api.ok && b.api.modus === "template";
  const viaApi = b.api.ok;
  const viaApp = !viaApi && b.handmatig.ok;

  const stuur = async () => {
    const t = tekst.trim();
    if (!t || bezig) return;
    setBezig(true);
    setFout(null);
    if (viaApi) {
      const r = await post("/api/crm/bericht", { contactId, kanaal, tekst: t, templateId: template ? (templateId ?? c.templateId) : null });
      if (!r.ok) setFout(r.message ?? "Versturen mislukt.");
      else setTekst("");
    } else if (viaApp) {
      const link = kanaal === "whatsapp" ? waLink(c.telefoon) : c.telefoon ? `sms:${c.telefoon}` : null;
      if (link) window.open(kanaal === "whatsapp" ? `${link}?text=${encodeURIComponent(t)}` : `${link}?body=${encodeURIComponent(t)}`, "_blank", "noreferrer");
      const r = await post("/api/crm/bericht", { contactId, kanaal, tekst: t, handmatig: true });
      if (!r.ok) setFout(r.message ?? "Vastleggen mislukt.");
      else setTekst("");
    }
    setBezig(false);
    router.refresh();
  };

  return (
    <div className="wa-invoer">
      {(fout || (!viaApi && !viaApp) || template || viaApp) && (
        <div className="wa-melding">
          {fout ?? (!viaApi && !viaApp ? (b.api.reden ?? b.handmatig.reden) : template ? "Buiten het 24-uursvenster mag alleen een goedgekeurde template. Kies er een en verstuur." : "WhatsApp via het CRM is nog niet aangesloten: Versturen opent je eigen WhatsApp met deze tekst en legt het bericht hier vast.")}
        </div>
      )}
      {template && c.templates.length > 1 && (
        <select className="wa-template" value={templateId ?? c.templateId ?? ""} onChange={(e) => setTemplateId(e.target.value)} aria-label="Template">
          {c.templates.filter((t) => t.goedgekeurd).map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
        </select>
      )}
      <div className="wa-invoer__rij">
        <select className="wa-kanaal" value={kanaal} onChange={(e) => { setKanaal(e.target.value as "whatsapp" | "sms"); setTemplateId(null); }} aria-label="Kanaal">
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">Sms</option>
        </select>
        <textarea
          ref={veld}
          rows={1}
          value={tekst}
          readOnly={template}
          disabled={!viaApi && !viaApp}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void stuur();
            }
          }}
          placeholder="Typ een bericht"
          aria-label="Bericht"
        />
        <button type="button" className="wa-stuur" onClick={() => void stuur()} disabled={bezig || !tekst.trim() || (!viaApi && !viaApp)} aria-label="Versturen" title={viaApp ? "Openen in je eigen WhatsApp" : "Versturen"}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
        </button>
      </div>
    </div>
  );
}
