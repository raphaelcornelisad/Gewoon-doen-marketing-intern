import Link from "next/link";
import type { BoardFilter } from "@/lib/crm/server";
import { FilterMenu, type FilterGroep } from "./filter-menu";
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
  const lijst = (v: string[]) => v.map((x) => ({ value: x, label: x }));
  const groepen: FilterGroep[] = [
    { key: "provincie", label: "Provincie", opties: [...lijst(opties.provincies), { value: "onbekend", label: "Provincie onbekend" }] },
    { key: "stad", label: "Plaats", opties: lijst(opties.steden) },
    ...(opties.types.length ? [{ key: "type", label: "Type bedrijf", opties: lijst(opties.types) }] : []),
    ...(opties.tags.length ? [{ key: "tag", label: "Tag", opties: lijst(opties.tags) }] : []),
    { key: "heeft", label: "Gegevens", opties: [{ value: "telefoon", label: "Met telefoon" }, { value: "website", label: "Met website" }, { value: "email", label: "Met e-mail" }] },
    ...(setters ? [{ key: "setter", label: pijplijn === "sales" ? "Setter (tag)" : "Eigenaar", opties: [...setters.map((x) => ({ value: x.id, label: x.naam })), { value: "geen", label: "Niemand" }] }] : []),
  ];
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
      <div className="crm-filters crm-filters--strak">
        <form className="fm-zoekbalk" action={action} method="get" role="search">
          {Object.entries(query).filter(([k, v]) => v && k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input name="q" defaultValue={f.q ?? ""} placeholder="Zoek salon, naam, telefoon, website…" aria-label="Zoeken" />
        </form>
        <FilterMenu action={action} query={query} groepen={groepen} />
        <BewaarWeergave pijplijn={pijplijn} query={huidig} />
      </div>
    </div>
  );
}
