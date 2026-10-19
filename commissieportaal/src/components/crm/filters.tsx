import type { BoardFilter } from "@/lib/crm/server";

export function Filters({
  action,
  f,
  opties,
  setters,
  toonMijn,
}: {
  action: string;
  f: BoardFilter;
  opties: { behandelingen: string[]; steden: string[]; provincies: string[]; tags: string[] };
  setters?: { id: string; naam: string }[];
  toonMijn: boolean;
}) {
  return (
    <form className="crm-filters" action={action} method="get">
      <input name="q" defaultValue={f.q ?? ""} placeholder="Zoek salon, naam, telefoon…" aria-label="Zoeken" />
      <select name="behandeling" defaultValue={f.behandeling ?? ""} aria-label="Behandeling">
        <option value="">Alle behandelingen</option>
        {opties.behandelingen.map((b) => <option key={b}>{b}</option>)}
      </select>
      {opties.tags.length > 0 && (
        <select name="tag" defaultValue={f.tag ?? ""} aria-label="Tag">
          <option value="">Alle tags</option>
          {opties.tags.map((b) => <option key={b}>{b}</option>)}
        </select>
      )}
      <select name="provincie" defaultValue={f.provincie ?? ""} aria-label="Provincie">
        <option value="">Alle provincies</option>
        {opties.provincies.map((b) => <option key={b}>{b}</option>)}
        <option value="onbekend">Onbekend</option>
      </select>
      <select name="stad" defaultValue={f.stad ?? ""} aria-label="Stad">
        <option value="">Alle steden</option>
        {opties.steden.map((b) => <option key={b}>{b}</option>)}
      </select>
      {setters && (
        <select name="setter" defaultValue={f.setter ?? ""} aria-label="Setter">
          <option value="">Alle setters</option>
          {setters.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
          <option value="geen">Niemand</option>
        </select>
      )}
      {toonMijn && (
        <label className="crm-check">
          <input type="checkbox" name="mijn" value="1" defaultChecked={!!f.mijn} /> Alleen mijn leads
        </label>
      )}
      <button type="submit" className="button button--small">Filter</button>
      <a href={action} className="small">Wissen</a>
    </form>
  );
}
