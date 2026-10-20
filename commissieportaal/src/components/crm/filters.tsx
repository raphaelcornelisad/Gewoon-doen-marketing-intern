import Link from "next/link";
import type { BoardFilter } from "@/lib/crm/server";
import { BewaarWeergave } from "./weergaven";

const SNEL: [NonNullable<BoardFilter["weergave"]>, string][] = [
  ["vandaag", "Vandaag opvolgen"],
  ["achterstallig", "Achterstallig"],
  ["nieuw", "Nieuwe leads"],
  ["mijn", "Eigen leads"],
  ["vrij", "Nog niet toegewezen"],
];

export function Filters({
  action,
  f,
  query,
  opties,
  setters,
  pijplijn,
  tabel,
  views,
}: {
  action: string;
  f: BoardFilter;
  query: Record<string, string | undefined>;
  opties: { behandelingen: string[]; types: string[]; steden: string[]; provincies: string[]; tags: string[] };
  setters?: { id: string; naam: string }[];
  pijplijn: "outbound" | "sales";
  tabel: boolean;
  views: { id: string; naam: string; query: string }[];
}) {
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${action}?${s}` : action;
  };
  const huidig = new URLSearchParams(Object.entries(query).filter(([k, v]) => v && k !== "toon") as [string, string][]).toString();
  return (
    <div className="crm-form">
      <div className="crm-chips crm-snel">
        {pijplijn === "outbound" &&
          SNEL.map(([k, l]) => (
            <Link key={k} href={qs({ weergave: f.weergave === k ? undefined : k })} className={`crm-chip crm-chip--btn${f.weergave === k ? " crm-chip--tag" : ""}`}>
              {l}
            </Link>
          ))}
        {views.map((v) => (
          <Link key={v.id} href={`${action}?${v.query}`} className={`crm-chip crm-chip--btn${huidig === v.query ? " crm-chip--tag" : ""}`}>★ {v.naam}</Link>
        ))}
        <span className="crm-weergave">
          <Link href={qs({ toon: undefined })} aria-current={!tabel && query.toon !== "gesprekken" ? "page" : undefined}>Bord</Link> ·{" "}
          <Link href={qs({ toon: "tabel" })} aria-current={tabel ? "page" : undefined}>Tabel</Link> ·{" "}
          <Link href={qs({ toon: "gesprekken" })} aria-current={query.toon === "gesprekken" ? "page" : undefined}>Gesprekken</Link>
        </span>
      </div>
      <form className="crm-filters" action={action} method="get">
        {f.weergave && <input type="hidden" name="weergave" value={f.weergave} />}
        {query.toon && <input type="hidden" name="toon" value={query.toon} />}
        <input name="q" defaultValue={f.q ?? ""} placeholder="Zoek salon, naam, telefoon, website…" aria-label="Zoeken" />
        {opties.types.length > 0 && (
          <select name="type" defaultValue={f.type ?? ""} aria-label="Type bedrijf">
            <option value="">Alle types</option>
            {opties.types.map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
        <select name="behandeling" defaultValue={f.behandeling ?? ""} aria-label="Behandeling">
          <option value="">Alle behandelingen</option>
          {opties.behandelingen.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select name="provincie" defaultValue={f.provincie ?? ""} aria-label="Regio">
          <option value="">Alle provincies</option>
          {opties.provincies.map((b) => <option key={b}>{b}</option>)}
          <option value="onbekend">Onbekend</option>
        </select>
        <select name="stad" defaultValue={f.stad ?? ""} aria-label="Plaats">
          <option value="">Alle plaatsen</option>
          {opties.steden.map((b) => <option key={b}>{b}</option>)}
        </select>
        {opties.tags.length > 0 && (
          <select name="tag" defaultValue={f.tag ?? ""} aria-label="Tag">
            <option value="">Alle tags</option>
            {opties.tags.map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
        <select name="heeft" defaultValue={f.heeft ?? ""} aria-label="Gegevens aanwezig">
          <option value="">Alle gegevens</option>
          <option value="telefoon">Met telefoon</option>
          <option value="website">Met website</option>
          <option value="email">Met e-mail</option>
        </select>
        {setters && (
          <select name="setter" defaultValue={f.setter ?? ""} aria-label="Setter">
            <option value="">{pijplijn === "sales" ? "Alle setters (tag)" : "Alle eigenaren"}</option>
            {setters.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
            <option value="geen">Niemand</option>
          </select>
        )}
        <button type="submit" className="button button--small">Filter</button>
        <Link href={action} className="small">Wissen</Link>
        <BewaarWeergave pijplijn={pijplijn} query={huidig} />
      </form>
    </div>
  );
}
