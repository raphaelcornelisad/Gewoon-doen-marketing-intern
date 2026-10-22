export interface NotitieItem {
  id: string;
  tekst: string;
  wie: string;
  wanneer: string;
  bron?: string;
}

/** Notities onder elkaar, nieuwste boven: direct leesbaar, ook op de telefoon. */
export function NotitieLijst({ items, leeg = "Nog geen notities." }: { items: NotitieItem[]; leeg?: string }) {
  if (!items.length) return <p className="muted" style={{ margin: 0 }}>{leeg}</p>;
  return (
    <ul className="nt-lijst">
      {items.map((n) => (
        <li key={n.id} className="nt-item">
          <p className="nt-tekst">{n.tekst}</p>
          <span className="nt-meta">{n.wie} · {n.wanneer}{n.bron ? ` · ${n.bron}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
