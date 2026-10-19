import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { AfspraakKnoppen } from "@/components/crm/lead-actions";
import { Live } from "@/components/crm/live";
import { acqSetters } from "@/lib/acquisitie/server";
import { agenda } from "@/lib/crm/agenda";
import { crmSettings } from "@/lib/crm/calendly";
import { FASES, faseLabel } from "@/lib/crm/core";
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
  const [items, setters, s, mislukt] = await Promise.all([
    agenda(user, amsterdamMidnight(van), amsterdamMidnight(totDatum)),
    acqSetters(),
    crmSettings(),
    user.rol === "admin" ? db().from("crm_webhook_events").select("id", { count: "exact", head: true }).eq("status", "mislukt") : Promise.resolve({ count: 0 }),
  ]);
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
  const perDag = new Map<string, typeof lijst>();
  for (const a of lijst) {
    const k = dag(new Date(a.start_op));
    perDag.set(k, [...(perDag.get(k) ?? []), a]);
  }
  const verschuif = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), van: dag(new Date(new Date(`${van}T12:00:00Z`).getTime() + n * 86400000)), dagen: String(dagen) })}`;
  const magStatus = user.rol === "admin" || user.rol === "sales";

  return (
    <>
      <CrmBar user={user} actief="/crm/agenda" />
      <Live sec={30} />
      <div className="crm-toolbar">
        <div>
          <h1>Agenda</h1>
          <p className="lead">Alleen afspraken die aan CRM-leads gekoppeld zijn. Ververst automatisch.</p>
        </div>
        <span className="small muted">
          Laatste Calendly-sync: {s.laatste_sync ? new Date(s.laatste_sync).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) : "nog nooit"}
          {s.calendly_webhook_uri ? " · webhook actief" : " · webhook nog niet aangezet"}
        </span>
      </div>
      {s.laatste_sync_fout && user.rol === "admin" && <div className="alert"><strong>Synchronisatiefout</strong><span className="small">{s.laatste_sync_fout}</span></div>}
      {!!mislukt.count && <div className="alert"><span className="small">{mislukt.count} Calendly-meldingen konden niet worden verwerkt. Zie Instellingen → Mislukte synchronisaties.</span></div>}
      <form className="crm-filters" method="get">
        <input type="date" name="van" defaultValue={van} aria-label="Vanaf" />
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
      {lijst.length === 0 && <p className="muted">Geen afspraken in deze periode.</p>}
      {[...perDag.entries()].map(([d, as]) => (
        <section key={d} className="card crm-form">
          <h2 style={{ margin: 0 }}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}{d === vandaag ? " · vandaag" : ""}</h2>
          {as.map((a) => (
            <div key={a.id} className="crm-agenda-item">
              <strong className="crm-timer" style={{ fontSize: 16 }}>{new Date(a.start_op).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" })}</strong>
              <div>
                <Link href={`/crm/lead/${a.contact.id}?tab=afspraken`}><strong>{a.contact.salon_naam}</strong></Link>
                <div className="small">
                  {a.contact.contactpersoon ?? "–"} · {a.type === "kennismaking" ? "Kennismaking" : "Salesgesprek"} · setter: {a.setter_id ? naam.get(a.setter_id) : "geen"}
                  {a.sales && ` · ${faseLabel("sales", a.sales.fase)}`}
                </div>
              </div>
              <span className={`crm-chip${a.status === "verschenen" ? " crm-chip--tag" : ""}`}>{STATUS[a.status]}</span>
              {magStatus && <AfspraakKnoppen id={a.id} status={a.status} />}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
