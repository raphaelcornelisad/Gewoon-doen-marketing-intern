"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { post, Sheet } from "./sheet";

type Tellers = { gebeld: number; gesproken: number; wafu: number; ingepland: number };
export type SessieData = { id: string; gestart_op: string; pauze_sinds: string | null; actief_sec: number; tellers: Tellers } | null;

const klok = (sec: number) => [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, "0")).join(":");

function Teller({ label, waarde }: { label: string; waarde: number }) {
  return (
    <div className="sb-teller">
      <span className="sb-teller__waarde">{waarde}</span>
      <span className="sb-teller__label">{label}</span>
    </div>
  );
}

/** Belsessie: start, tijd (zonder pauzes), live tellers en afsluiten + indienen. */
export function SessieBalk({ start, leadId, demo = false }: { start: SessieData; leadId: string | null; demo?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<SessieData>(start);
  const [basis, setBasis] = useState(() => ({ sec: start?.actief_sec ?? 0, op: Date.now() }));
  const [nu, setNu] = useState(Date.now());
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [afsluiten, setAfsluiten] = useState(false);
  const [notitie, setNotitie] = useState("");
  const [demoKlaar, setDemoKlaar] = useState<string | null>(null);

  const zet = (n: SessieData) => {
    setS(n);
    setBasis({ sec: n?.actief_sec ?? 0, op: Date.now() });
  };

  useEffect(() => {
    const t = setInterval(() => setNu(Date.now()), 1000);
    const v = setInterval(async () => {
      if (demo || document.visibilityState !== "visible") return;
      const d = await fetch("/api/crm/sessie").then((r) => r.json()).catch(() => null);
      if (d?.ok) zet(d.sessie);
    }, 15000);
    return () => {
      clearInterval(t);
      clearInterval(v);
    };
  }, [demo]);

  const pauze = !!s?.pauze_sinds;
  const sec = s ? basis.sec + (pauze ? 0 : Math.max(0, Math.round((nu - basis.op) / 1000))) : 0;

  // Voorbeeldmodus (admin): alles lokaal, niets opgeslagen of aan een setter toegeschreven.
  const demoActie = (a: string) => {
    const leeg = { gebeld: 0, gesproken: 0, wafu: 0, ingepland: 0 };
    if (a === "start") return { sessie: { id: "voorbeeld", gestart_op: new Date().toISOString(), pauze_sinds: null, actief_sec: 0, tellers: leeg } };
    if (!s) return null;
    if (a === "pauze") return { sessie: { ...s, actief_sec: sec, pauze_sinds: new Date().toISOString() } };
    if (a === "hervat") return { sessie: { ...s, actief_sec: sec, pauze_sinds: null } };
    if (a === "indienen") return { samenvatting: { ...s.tellers, actief_sec: sec } };
    return null;
  };
  const oefen = (soort: "niet_opgenomen" | "gesproken" | "wafu" | "ingepland") => {
    if (!s) return;
    const t = { ...s.tellers, gebeld: s.tellers.gebeld + 1 };
    if (soort !== "niet_opgenomen") t.gesproken++;
    if (soort === "wafu") t.wafu++;
    if (soort === "ingepland") t.ingepland++;
    setS({ ...s, tellers: t });
  };

  const actie = async (a: string, extra: Record<string, unknown> = {}) => {
    if (demo) return demoActie(a);
    setBezig(true);
    setFout(null);
    const r = await post("/api/crm/sessie", { actie: a, ...extra });
    setBezig(false);
    if (!r.ok) {
      setFout(r.message ?? "Mislukt.");
      return null;
    }
    return r.data;
  };

  const begin = async () => {
    const d = await actie("start");
    if (!d) return;
    zet(d.sessie);
    if (leadId || demo) return;
    try {
      sessionStorage.removeItem("gdm_bel_overslaan");
    } catch {
      /* geen opslag */
    }
    const r = await post("/api/crm/bellen/volgende", { overslaan: [] });
    if (r.ok && r.data.contactId) router.push(`/crm/bellen?lead=${r.data.contactId}&sessie=1`);
    else router.push("/crm/bellen?leeg=1");
  };

  if (!s) {
    return (
      <>
      {demoKlaar && <div className="notice">Voorbeeld ingediend: {demoKlaar}. In het echt staat dit nu in Beheer → Belsessies.</div>}
      <section className="sb sb--uit">
        <div>
          <strong>Geen belsessie actief</strong>
          <span className="small muted">Start een sessie: de tijd loopt en je belpogingen, gesprekken en WAFU&apos;s worden geteld.</span>
        </div>
        <button type="button" className="button crm-belknop" disabled={bezig} onClick={() => void begin()}>
          {bezig ? "Bezig…" : "Start belsessie"}
        </button>
        {fout && <span className="small field-error">{fout}</span>}
      </section>
      </>
    );
  }

  return (
    <>
      <section className={`sb${pauze ? " sb--pauze" : ""}`} aria-label="Belsessie">
        <div className="sb-tijd">
          <span className={`sb-stip${pauze ? " is-pauze" : ""}`} aria-hidden="true" />
          <span className="sb-klok">{klok(sec)}</span>
          <span className="small muted">{pauze ? "Gepauzeerd" : "Actief aan het bellen"}</span>
        </div>
        <div className="sb-tellers">
          <Teller label="Gebeld" waarde={s.tellers.gebeld} />
          <Teller label="Gesproken" waarde={s.tellers.gesproken} />
          <Teller label="WAFU" waarde={s.tellers.wafu} />
          <Teller label="Ingepland" waarde={s.tellers.ingepland} />
        </div>
        <div className="sb-knoppen">
          <button type="button" className="button button--small button--ghost" disabled={bezig} onClick={async () => { const d = await actie(pauze ? "hervat" : "pauze"); if (d) zet(d.sessie); }}>
            {pauze ? "Hervatten" : "Pauze"}
          </button>
          <button type="button" className="button button--small" disabled={bezig} onClick={() => setAfsluiten(true)}>Afsluiten &amp; indienen</button>
        </div>
        {fout && <span className="small field-error">{fout}</span>}
        {demo && (
          <div className="sb-oefen">
            <span className="small muted">Oefenen (voorbeeld): registreer een uitkomst →</span>
            <button type="button" className="fm-chip" onClick={() => oefen("niet_opgenomen")}>Niet opgenomen</button>
            <button type="button" className="fm-chip" onClick={() => oefen("gesproken")}>Gesproken</button>
            <button type="button" className="fm-chip" onClick={() => oefen("wafu")}>Opvolgen via WhatsApp</button>
            <button type="button" className="fm-chip" onClick={() => oefen("ingepland")}>Ingepland</button>
          </div>
        )}
      </section>
      {afsluiten && (
        <Sheet titel="Belsessie afsluiten" onClose={() => setAfsluiten(false)}>
          <div className="crm-form">
            <div className="sb-samenvatting">
              <Teller label="Minuten actief" waarde={Math.round(sec / 60)} />
              <Teller label="Gebeld" waarde={s.tellers.gebeld} />
              <Teller label="Gesproken" waarde={s.tellers.gesproken} />
              <Teller label="WAFU" waarde={s.tellers.wafu} />
              <Teller label="Ingepland" waarde={s.tellers.ingepland} />
            </div>
            <span className="small muted">Pauzes tellen niet mee. Bij indienen worden de aantallen definitief vastgelegd voor de admin.</span>
            <label>
              Opmerking (optioneel)
              <textarea rows={3} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Bijv. veel voicemails, morgen Noord-Holland verder" />
            </label>
            <button
              type="button"
              className="button"
              disabled={bezig}
              onClick={async () => {
                const d = await actie("indienen", { notitie });
                if (!d) return;
                setAfsluiten(false);
                if (demo) {
                  const t = d.samenvatting;
                  setDemoKlaar(`${Math.round(t.actief_sec / 60)} min actief · ${t.gebeld} gebeld · ${t.gesproken} gesproken · ${t.wafu} WAFU · ${t.ingepland} ingepland`);
                  zet(null);
                  return;
                }
                if (leadId) await post("/api/crm/bellen/vrijgeven", { contactId: leadId });
                zet(null);
                router.push("/crm/bellen?ingediend=1");
                router.refresh();
              }}
            >
              {bezig ? "Bezig…" : "Sessie indienen"}
            </button>
            {fout && <span className="small field-error">{fout}</span>}
          </div>
        </Sheet>
      )}
    </>
  );
}
