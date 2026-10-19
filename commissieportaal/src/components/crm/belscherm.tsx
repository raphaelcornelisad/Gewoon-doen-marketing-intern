"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BerichtVenster, InplanVenster } from "./acties";
import { Icon } from "./icons";
import { post } from "./sheet";

type Uitkomst = { key: string; label: string };
interface Props {
  lead: {
    id: string;
    outboundId: string | null;
    salon: string;
    contactpersoon: string | null;
    telefoon: string | null;
    telefoonNorm: string | null;
    website: string | null;
    email: string | null;
    plaats: string;
    fase: string;
    belpogingen: number;
    nietBenaderen: boolean;
  };
  uitkomsten: Uitkomst[];
  provider: "twilio" | "handmatig";
  autoDoorbellen: boolean;
  aftelSec: number;
  sessie: boolean;
}

const OVERSLAAN = "gdm_bel_overslaan";
const PAUZE = "gdm_bel_pauze";
const lees = <T,>(k: string, d: T): T => {
  try {
    const v = sessionStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const schrijf = (k: string, v: unknown) => {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* geen opslag beschikbaar */
  }
};
const tijd = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const morgen10 = () => {
  const d = new Date(Date.now() + 86400000);
  d.setHours(10, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

type TwilioCall = { disconnect: () => void; on: (e: string, f: () => void) => void };
type TwilioDevice = { connect: (o: { params: Record<string, string> }) => Promise<TwilioCall>; destroy: () => void };

export function BelScherm(p: Props) {
  const router = useRouter();
  const [fase, setFase] = useState<"klaar" | "bellen" | "afgelopen" | "afronden">("klaar");
  const [callId, setCallId] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [nu, setNu] = useState(Date.now());
  const [eind, setEind] = useState<number | null>(null);
  const [notitie, setNotitie] = useState("");
  const [terug, setTerug] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [venster, setVenster] = useState<"wavo" | "inplannen" | null>(null);
  const [aftel, setAftel] = useState<number | null>(null);
  const [pauze, setPauze] = useState(false);
  const [busy, setBusy] = useState(false);
  const device = useRef<TwilioDevice | null>(null);
  const call = useRef<TwilioCall | null>(null);
  const notitieFocus = useRef(false);

  useEffect(() => setPauze(lees(PAUZE, false)), []);
  useEffect(() => {
    if (fase !== "bellen") return;
    const t = setInterval(() => setNu(Date.now()), 1000);
    return () => clearInterval(t);
  }, [fase]);
  useEffect(() => () => device.current?.destroy(), []);

  const volgende = useCallback(async () => {
    setAftel(null);
    setBusy(true);
    const overslaan = lees<string[]>(OVERSLAAN, []);
    const r = await post("/api/crm/bellen/volgende", { overslaan });
    setBusy(false);
    if (!r.ok) return setFout(r.message ?? "Volgende lead ophalen mislukt.");
    if (!r.data.contactId) return router.push("/crm/bellen?leeg=1");
    router.push(`/crm/bellen?lead=${r.data.contactId}&sessie=1`);
  }, [router]);

  // Aftellen naar de volgende lead: alleen in een sessie, niet gepauzeerd, geen venster open, niet aan het typen.
  useEffect(() => {
    if (fase !== "afronden" || venster || pauze || !p.sessie || !p.autoDoorbellen) return;
    setAftel(p.aftelSec);
  }, [fase, venster, pauze, p.sessie, p.autoDoorbellen, p.aftelSec]);
  useEffect(() => {
    if (aftel === null) return;
    if (pauze || venster || notitieFocus.current) return setAftel(null);
    if (aftel <= 0) {
      void volgende();
      return;
    }
    const t = setTimeout(() => setAftel((a) => (a === null ? null : a - 1)), 1000);
    return () => clearTimeout(t);
  }, [aftel, pauze, venster, volgende]);

  async function bel() {
    setFout(null);
    setBusy(true);
    const r = await post("/api/crm/bellen/start", { contactId: p.lead.id });
    setBusy(false);
    if (!r.ok) return setFout(r.message ?? "Bellen kon niet starten.");
    setCallId(r.data.callId);
    setStart(Date.now());
    setNu(Date.now());
    setFase("bellen");
    if (r.data.provider === "twilio") {
      try {
        const tok = await fetch("/api/crm/twilio-token").then((x) => x.json());
        if (!tok.ok) throw new Error(tok.message);
        const { Device } = await import("@twilio/voice-sdk");
        device.current ??= new Device(tok.token, { codecPreferences: ["opus", "pcmu"] as never }) as unknown as TwilioDevice;
        const c = await device.current.connect({ params: { To: r.data.telefoon, callId: r.data.callId } });
        call.current = c;
        c.on("disconnect", () => {
          setEind(Date.now());
          setFase("afgelopen");
        });
        c.on("error", () => setFout("Twilio meldt een fout tijdens het gesprek."));
      } catch (e) {
        setFout(`Bellen via Twilio mislukt: ${e instanceof Error ? e.message : "onbekend"}. Registreer de uitkomst of bel handmatig.`);
      }
    } else {
      window.location.href = `tel:${r.data.telefoon}`;
    }
  }

  async function uitkomst(u: Uitkomst) {
    if (!callId) return;
    if (u.key === "terugbellen" && !terug) return setTerug(morgen10());
    call.current?.disconnect();
    setBusy(true);
    const duurSec = start ? Math.round(((eind ?? Date.now()) - start) / 1000) : null;
    const r = await post("/api/crm/bellen/uitkomst", {
      callId,
      uitkomst: u.key,
      notitie,
      opvolgOp: u.key === "terugbellen" && terug ? new Date(terug).toISOString() : null,
      duurSec: p.provider === "handmatig" ? duurSec : null,
    });
    setBusy(false);
    if (!r.ok) return setFout(r.message ?? "Opslaan mislukt.");
    setFase("afronden");
    router.refresh();
    if (r.data.wavo) setVenster("wavo");
    else if (r.data.inplannen) setVenster("inplannen");
  }

  async function overslaan() {
    schrijf(OVERSLAAN, [...lees<string[]>(OVERSLAAN, []), p.lead.id]);
    await post("/api/crm/bellen/vrijgeven", { contactId: p.lead.id });
    await volgende();
  }

  const duur = start ? Math.round(((eind ?? nu) - start) / 1000) : 0;
  const tel = p.lead.telefoon;

  return (
    <div className="crm-bel">
      <section className="card crm-form">
        <div className="crm-toolbar">
          <div>
            <h1 style={{ margin: 0 }}>{p.lead.salon}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {[p.lead.contactpersoon, p.lead.plaats].filter(Boolean).join(" · ")} · {p.lead.belpogingen} eerdere belpogingen
            </p>
          </div>
          <Link href={`/crm/lead/${p.lead.id}`} className="small" target="_blank">Volledige leadkaart ↗</Link>
        </div>
        <div className="crm-kv">
          <dt>Telefoon</dt>
          <dd>{tel ?? "–"}</dd>
          <dt>Website</dt>
          <dd>{p.lead.website ? <a href={/^https?:/.test(p.lead.website) ? p.lead.website : `https://${p.lead.website}`} target="_blank" rel="noreferrer">{p.lead.website}</a> : "–"}</dd>
          <dt>E-mail</dt>
          <dd>{p.lead.email ?? "–"}</dd>
        </div>

        {p.lead.nietBenaderen ? (
          <div className="alert">Deze lead staat op niet meer benaderen. Niet bellen.</div>
        ) : fase === "klaar" ? (
          <div className="inline-form__row">
            <button type="button" className="button crm-belknop" disabled={busy || !p.lead.telefoonNorm} onClick={bel}>
              <Icon name="phone" /> Bellen {tel}
            </button>
            <button type="button" className="button button--ghost button--small" disabled={busy} onClick={overslaan}>Overslaan</button>
          </div>
        ) : (
          <div className="crm-belstatus">
            <span className={`crm-dot${fase === "bellen" ? " is-live" : ""}`} />
            <strong>{fase === "bellen" ? "In gesprek" : fase === "afgelopen" ? "Gesprek beëindigd" : "Afgerond"}</strong>
            <span className="crm-timer">{tijd(duur)}</span>
            {fase === "bellen" && p.provider === "twilio" && (
              <button type="button" className="button button--small" onClick={() => call.current?.disconnect()}>
                <Icon name="ophangen" size={18} /> Ophangen
              </button>
            )}
            <span className="small muted">{p.provider === "handmatig" ? "Handmatig gebeld via je eigen telefoon (geen providerstatus)." : "Bellen via Twilio."}</span>
          </div>
        )}

        {(fase === "bellen" || fase === "afgelopen") && (
          <div className="crm-form">
            <label>
              Notitie bij dit gesprek
              <textarea rows={3} value={notitie} onChange={(e) => setNotitie(e.target.value)} onFocus={() => (notitieFocus.current = true)} onBlur={() => (notitieFocus.current = false)} placeholder="Wat is er besproken?" />
            </label>
            <strong className="small">Uitkomst (één klik)</strong>
            <div className="crm-uitkomsten">
              {p.uitkomsten.map((u) => (
                <button key={u.key} type="button" className={`crm-uitkomst${u.key === "ingepland" ? " crm-uitkomst--groen" : ""}${u.key === "niet_benaderen" ? " crm-uitkomst--rood" : ""}`} disabled={busy} onClick={() => uitkomst(u)}>
                  {u.label}
                </button>
              ))}
            </div>
            {terug !== null && (
              <div className="inline-form__row">
                <label className="small">
                  Terugbellen op
                  <input type="datetime-local" value={terug} onChange={(e) => setTerug(e.target.value)} />
                </label>
                <button type="button" className="button button--small" onClick={() => uitkomst({ key: "terugbellen", label: "Terugbellen" })}>Opslaan</button>
              </div>
            )}
          </div>
        )}

        {fase === "afronden" && !venster && (
          <div className="crm-volgende">
            {aftel !== null ? (
              <>
                <span>Volgende lead over <strong>{aftel}</strong> s…</span>
                <button type="button" className="button button--small button--ghost" onClick={() => { setPauze(true); schrijf(PAUZE, true); }}>
                  <Icon name="pauze" size={18} /> Pauze
                </button>
              </>
            ) : (
              <>
                <button type="button" className="button button--small" disabled={busy} onClick={volgende}>
                  <Icon name="volgende" size={18} /> Volgende lead
                </button>
                {pauze && (
                  <button type="button" className="linkbutton" onClick={() => { setPauze(false); schrijf(PAUZE, false); }}>
                    Automatisch doorbellen hervatten
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {fout && <div className="alert"><span className="small">{fout}</span></div>}
      </section>

      {venster === "wavo" && (
        <BerichtVenster
          contactId={p.lead.id}
          doel="wavo"
          titel="Plaats deze lead bij WAVO en stuur een bericht"
          onKlaar={async () => {
            if (p.lead.outboundId) await post(`/api/crm/opp/${p.lead.outboundId}`, { fase: "wavo" });
            setVenster(null);
          }}
          onSluit={() => setVenster(null)}
          extra={
            <div className="inline-form__row">
              <button type="button" className="button button--small button--ghost" onClick={() => setVenster(null)}>Later opvolgen (morgen)</button>
              <button type="button" className="linkbutton" onClick={() => setVenster(null)}>Overslaan</button>
            </div>
          }
        />
      )}
      {venster === "inplannen" && <InplanVenster contactId={p.lead.id} onSluit={() => setVenster(null)} />}
    </div>
  );
}
