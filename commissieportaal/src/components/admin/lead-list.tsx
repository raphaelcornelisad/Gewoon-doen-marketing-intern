"use client";

import { useState } from "react";
import type { ColorClass } from "@/lib/sheets/types";

export interface LeadTab {
  tab: string;
  rijen: { rij: number; naam: string; kleur: ColorClass; hex: string | null; pogingen: number; pogingenRuw: number }[];
}

const FILTERS: { key: ColorClass | "alle"; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "groen", label: "Groen" },
  { key: "geel", label: "Geel" },
  { key: "rood", label: "Rood" },
  { key: "ongekleurd", label: "Ongekleurd" },
];

export function LeadList({ tabs }: { tabs: LeadTab[] }) {
  const [filter, setFilter] = useState<ColorClass | "alle">("alle");
  const [open, setOpen] = useState(false);

  return (
    <div className="leads">
      <div className="filter" role="group" aria-label="Filter op kleur">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.key !== "alle" && <span className={`dot dot--${f.key}`} />}
            {f.label}
          </button>
        ))}
        <button type="button" className="linkbutton" onClick={() => setOpen((o) => !o)}>
          {open ? "Alles inklappen" : "Alles uitklappen"}
        </button>
      </div>
      {tabs.map((t) => {
        const rows = t.rijen.filter((r) => filter === "alle" || r.kleur === filter);
        if (!rows.length) return null;
        return (
          <details key={`${t.tab}-${open}`} open={open || undefined}>
            <summary>
              <span>{t.tab}</span>
              <span className="muted small">{rows.length} leads</span>
            </summary>
            <ul>
              {rows.map((r) => (
                <li key={r.rij}>
                  <span className="muted small mono">{r.rij}</span>
                  <span className={`dot dot--${r.kleur}`} title={r.hex ?? "geen kleur"} />
                  <span className="lead-name">{r.naam}</span>
                  <span className="muted small mono">
                    {r.pogingenRuw > r.pogingen ? `${"x".repeat(r.pogingen)} (${r.pogingenRuw})` : "x".repeat(r.pogingen)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
