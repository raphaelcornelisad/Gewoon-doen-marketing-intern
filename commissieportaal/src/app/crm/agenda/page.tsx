import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { AfspraakKnoppen, TaakAfvinken } from "@/components/crm/lead-actions";
import { Live } from "@/components/crm/live";
import { acqSetters } from "@/lib/acquisitie/server";
import { agenda, herinneringen } from "@/lib/crm/agenda";
import { crmSettings } from "@/lib/crm/calendly";
import { FASES, faseLabel } from "@/lib/crm/core";
import { googleAgenda, koppelingen, type GoogleEvent } from "@/lib/crm/google";
import { amsterdamMidnight, requireCrmUser } from "@/lib/crm/server";
import { db } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agenda · CRM" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { gepland: "Gepland", verplaatst: "Verplaatst", geannuleerd: "Geannuleerd", verschenen: "Verschenen", no_show: "No-show" };
const dag = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireCrmUser();
  const sp = await searchParams;
  const vandaag = dag(new Date());
  const van = /^\d{4}-\d{2}-\d{2}$/.test(sp.van ?? "") ? sp.van! : vandaag;
  const dagen = Math.min(Math.max(Number(sp.dagen) || 7, 1), 62);
  const totDatum = dag(new Date(new Date(`${van}T12:00:00Z`).getTime() + dagen * 86400000));
  const vanIso = amsterdamMidnight(van);
  const totIso = amsterdamMidnight(totDatum);
  const toon = sp.toon ?? "";
  const [items, setters, s, mislukt, herin, gekoppeld] = await Promise.all([
    agenda(user, vanIso, totIso),
    acqSetters(),
    crmSettings(),
    user.rol === "admin" ? db().from("crm_webhook_events").select("id", { count: "exact", head: true }).eq("status", "mislukt") : Promise.resolve({ count: 0 }),
    herinneringen(user, vanIso, totIso),
    koppelingen(),
  ]);
  // Google Agenda live: setter ziet de eigen agenda, admin die van de gekoppelde setters (of de gekozen setter).
  const agendaVan = user.rol === "admin" ? [...gekoppeld.keys()].filter((id) => !sp.setter || id === sp.setter) : user.setter && gekoppeld.has(user.setter.id) ? [user.setter.id] : [];
  const google = toon && toon !== "google" ? [] : await Promise.all(agendaVan.map(async (id) => ({ id, ...(await googleAgenda(id, vanIso, totIso)) })));
  const naam = new Map(setters.map((x) => [x.id, x.naam]));
  const lijst = items.filter((a) => {
    if (sp.mijn === "1" && user.setter && a.setter_id !== user.setter.id && a.sales?.verkoper_id !== user.setter.id) return false;
    if (sp.setter && a.setter_id !== sp.setter) return false;
    if (sp.verkoper && a.sales?.verkoper_id !== sp.verkoper) return false;
    if (sp.type && a.type !== sp.type) return false;
    if (sp.status ? a.status !== sp.status : a.status === "verplaatst") return false;
    if (sp.fase && a.sales?.fase !== sp.fase) return false;
    return true;
  });
  type Rij =
    | { soort: "afspraak"; start: string; a: (typeof lijst)[number] }
    | { soort: "herinnering"; start: string; h: (typeof herin)[number] }
    | { soort: "google"; start: string; g: GoogleEvent; setter: string };
  const rijen: Rij[] = [
    ...(!toon || toon === "afspraken" ? lijst.map((a) => ({ soort: "afspraak" as const, start: a.start_op, a })) : []),
    ...(!toon || toon === "herinneringen" ? herin.filter((h) => !sp.setter || h.setter_id === sp.setter).map((h) => ({ soort: "herinnering" as const, start: h.start_op, h })) : []),
    ...google.flatMap((x) => x.items.map((g) => ({ soort: "google" as const, start: g.heleDag ? g.start : g.start, g, setter: x.id }))),
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const perDag = new Map<string, Rij[]>();
  for (const r of rijen) {
    const k = r.soort === "google" && r.g.heleDag ? r.g.start.slice(0, 10) : dag(new Date(r.start));
    perDag.set(k, [...(perDag.get(k) ?? []), r]);
  }
  const tijd = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
  const googleFouten = google.filter((x) => x.fout);
  const verschuif = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), van: dag(new Date(new Date(`${van}T12:00:00Z`).getTime() + n * 86400000)), dagen: String(dagen) })}`;
  const magStatus = user.rol === "admin" || user.rol === "sales";

  return (
    <>
      <CrmBar user={user} actief="/crm/agenda" />
      <Live sec={30} />
      <div className="crm-toolbar">
        <div>
          <h1>Agenda</h1>
          <p className="lead">Calendly-afspraken ({s.calendly_event_kennismaking}{s.calendly_url_sales ? ` en ${s.calendly_event_sales}` : ""}), taken, terugbelmomenten en {user.rol === "admin" ? "de Google Agenda van gekoppelde setters" : "je eigen Google Agenda"}. Ververst automatisch.</p>
        </div>
        <span className="small muted">
          Laatste Calendly-sync: {s.laatste_sync ? new Date(s.laatste_sync).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) : "nog nooit"}
          {s.calendly_webhook_uri ? " · webhook actief" : " · webhook nog niet aangezet"}
        </span>
      </div>
      {s.laatste_sync_fout && user.rol === "admin" && <div className="alert"><strong>Synchronisatiefout</strong><span className="small">{s.laatste_sync_fout}</span></div>}
      {googleFouten.map((x) => <div key={x.id} className="alert"><span className="small">Google Agenda van {naam.get(x.id) ?? "setter"}: {x.fout}</span></div>)}
      {!!mislukt.count && <div className="alert"><span className="small">{mislukt.count} Calendly-meldingen konden niet worden verwerkt. Zie Instellingen → Mislukte synchronisaties.</span></div>}
      <form className="crm-filters" method="get">
        <input type="date" name="van" defaultValue={van} aria-label="Vanaf" />
        <select name="toon" defaultValue={toon} aria-label="Wat tonen">
          <option value="">Alles</option>
          <option value="afspraken">Calendly-afspraken</option>
          <option value="herinneringen">Taken en terugbellen</option>
          <option value="google">Google Agenda</option>
        </select>
        <select name="dagen" defaultValue={String(dagen)} aria-label="Periode">
          <option value="1">1 dag</option>
          <option value="7">Week</option>
          <option value="31">Maand</option>
        </select>
        {user.setter && <label className="crm-check"><input type="checkbox" name="mijn" value="1" defaultChecked={sp.mijn === "1"} /> Eigen afspraken</label>}
        {user.rol === "admin" && (
          <>
            <select name="setter" defaultValue={sp.setter ?? ""} aria-label="Setter">
              <option value="">Alle setters</option>
              {setters.filter((x) => x.rol === "setter").map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}
            </select>
            <select name="verkoper" defaultValue={sp.verkoper ?? ""} aria-label="Salesmedewerker">
              <option value="">Alle salesmedewerkers</option>
              {setters.filter((x) => x.rol === "sales").map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}
            </select>
          </>
        )}
        <select name="type" defaultValue={sp.type ?? ""} aria-label="Gesprekstype">
          <option value="">Alle gesprekken</option>
          <option value="kennismaking">Kennismaking</option>
          <option value="salesgesprek">Salesgesprek</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Actuele status (zonder verplaatst)</option>
          {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select name="fase" defaultValue={sp.fase ?? ""} aria-label="Pijplijnfase">
          <option value="">Alle salesfases</option>
          {FASES.sales.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <button type="submit" className="button button--small">Toon</button>
        <Link href={verschuif(-dagen)} className="small">← Vorige</Link>
        <Link href={verschuif(dagen)} className="small">Volgende →</Link>
      </form>
      {rijen.length === 0 && <p className="muted">Niets gepland in deze periode.</p>}
      {[...perDag.entries()].map(([d, rs]) => (
        <section key={d} className="card crm-form">
          <h2 style={{ margin: 0 }}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}{d === vandaag ? " · vandaag" : ""}</h2>
          {rs.map((r) =>
            r.soort === "afspraak" ? (
              <div key={r.a.id} className="crm-agenda-item">
                <strong className="crm-timer" style={{ fontSize: 16 }}>{tijd(r.a.start_op)}</strong>
                <div>
                  <Link href={`/crm/lead/${r.a.contact.id}?tab=afspraken`}><strong>{r.a.contact.salon_naam}</strong></Link>
                  <div className="small">
                    📅 {r.a.type === "kennismaking" ? "Kennismaking" : "Salesgesprek"} · {r.a.contact.contactpersoon ?? "–"} · setter: {r.a.setter_id ? naam.get(r.a.setter_id) : "geen"}
                    {r.a.sales && ` · ${faseLabel("sales", r.a.sales.fase)}`}
                  </div>
                </div>
                <span className={`crm-chip${r.a.status === "verschenen" ? " crm-chip--tag" : ""}`}>{STATUS[r.a.status]}</span>
                {magStatus && <AfspraakKnoppen id={r.a.id} status={r.a.status} />}
              </div>
            ) : r.soort === "herinnering" ? (
              <div key={r.h.id} className="crm-agenda-item">
                <strong className="crm-timer" style={{ fontSize: 16 }}>{tijd(r.h.start_op)}</strong>
                <div>
                  {r.h.soort === "taak" ? <TaakAfvinken id={r.h.id.slice(2)} gedaan={false} titel={`✅ ${r.h.titel}`} /> : <strong>📞 Terugbellen</strong>}
                  <div className="small">
                    {r.h.contact && <Link href={`/crm/lead/${r.h.contact.id}`}>{r.h.contact.salon_naam}</Link>}
                    {user.rol === "admin" && ` · ${r.h.setter_id ? (naam.get(r.h.setter_id) ?? "?") : "niet toegewezen"}`}
                  </div>
                </div>
                <span className="crm-chip" title={r.h.inGoogle ? "Staat in Google Agenda" : "Nog niet in Google Agenda"}>{r.h.inGoogle ? "✓ Google" : r.h.soort === "taak" ? "Taak" : "Terugbellen"}</span>
              </div>
            ) : (
              <div key={`${r.setter}-${r.g.id}`} className="crm-agenda-item crm-agenda-item--google">
                <strong className="crm-timer" style={{ fontSize: 16 }}>{r.g.heleDag ? "hele dag" : tijd(r.g.start)}</strong>
                <div>
                  <strong>{r.g.titel}</strong>
                  <div className="small muted">Google Agenda{user.rol === "admin" ? ` · ${naam.get(r.setter) ?? "setter"}` : ""}</div>
                </div>
                {r.g.link ? <a className="crm-chip" href={r.g.link} target="_blank" rel="noreferrer">Openen</a> : <span />}
              </div>
            ),
          )}
        </section>
      ))}
    </>
  );
}
