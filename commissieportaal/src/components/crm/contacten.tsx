"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ContactRij {
  id: string;
  bedrijf: string;
  eigenaar: string | null;
  telefoon: string | null;
  email: string | null;
  stad: string | null;
  provincie: string | null;
  crm: string;
  behandelingen: string[];
  tags: string[];
  status: string;
  geblokkeerd: boolean;
}

const uniek = (v: (string | null)[]) => [...new Set(v.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "nl"));
const leesbaar = (t: string) => (t.startsWith("+31") ? `0${t.slice(3)}` : t);
const csvVeld = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Doorzoekbare contactenlijst met filters en export (direct in de browser). */
export function ContactenTabel({ contacten }: { contacten: ContactRij[] }) {
  const [q, setQ] = useState("");
  const [provincie, setProvincie] = useState("");
  const [behandeling, setBehandeling] = useState("");
  const [crm, setCrm] = useState("");
  const opties = useMemo(
    () => ({
      provincies: uniek(contacten.map((c) => c.provincie)),
      behandelingen: uniek(contacten.flatMap((c) => [...c.behandelingen, c.crm])),
      crms: uniek(contacten.map((c) => c.crm)),
    }),
    [contacten],
  );
  const z = q.trim().toLowerCase();
  const lijst = contacten.filter(
    (c) =>
      (!provincie || (provincie === "onbekend" ? !c.provincie : c.provincie === provincie)) &&
      (!behandeling || c.behandelingen.includes(behandeling) || c.crm === behandeling) &&
      (!crm || c.crm === crm) &&
      (!z || [c.bedrijf, c.eigenaar, c.telefoon, c.email, c.stad, c.provincie, ...c.tags].some((v) => v?.toLowerCase().includes(z))),
  );

  const exporteer = () => {
    const kop = ["Bedrijf", "Eigenaar", "Telefoon", "E-mail", "Stad", "Provincie", "Behandeling", "Tags", "Status", "CRM"];
    const rijen = lijst.map((c) => [c.bedrijf, c.eigenaar ?? "", c.telefoon ?? "", c.email ?? "", c.stad ?? "", c.provincie ?? "", (c.behandelingen.length ? c.behandelingen : [c.crm]).join(", "), c.tags.join(", "), c.status, c.crm]);
    const tekst = "﻿" + [kop, ...rijen].map((r) => r.map(csvVeld).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([tekst], { type: "text/csv;charset=utf-8" }));
    a.download = `contacten-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="card crm-contacten">
      <div className="crm-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek bedrijf, naam, telefoon, e-mail, stad…" aria-label="Zoeken" />
        <select value={provincie} onChange={(e) => setProvincie(e.target.value)} aria-label="Provincie">
          <option value="">Alle provincies</option>
          {opties.provincies.map((p) => <option key={p}>{p}</option>)}
          <option value="onbekend">Provincie onbekend</option>
        </select>
        <select value={behandeling} onChange={(e) => setBehandeling(e.target.value)} aria-label="Behandeling">
          <option value="">Alle behandelingen</option>
          {opties.behandelingen.map((b) => <option key={b}>{b}</option>)}
        </select>
        {opties.crms.length > 1 && (
          <select value={crm} onChange={(e) => setCrm(e.target.value)} aria-label="CRM">
            <option value="">Alle CRM&apos;s</option>
            {opties.crms.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <button type="button" className="button button--small button--ghost" onClick={exporteer}>Exporteren (CSV)</button>
      </div>
      <p className="small muted">{lijst.length} van {contacten.length} contacten</p>
      <div className="crm-contacten__tabel">
        <table className="table">
          <thead>
            <tr><th>Bedrijf</th><th>Eigenaar</th><th>Telefoon</th><th>E-mail</th><th>Stad</th><th>Provincie</th><th>Behandeling</th><th>Status</th></tr>
          </thead>
          <tbody>
            {lijst.map((c) => (
              <tr key={c.id} className={c.geblokkeerd ? "crm-rij--rood" : undefined}>
                <td><Link href={`/crm/lead/${c.id}`}><strong>{c.bedrijf}</strong></Link></td>
                <td>{c.eigenaar ?? <span className="muted">—</span>}</td>
                <td className="crm-nowrap">{c.telefoon ? <a href={`tel:${c.telefoon}`}>{leesbaar(c.telefoon)}</a> : <span className="muted">—</span>}</td>
                <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">—</span>}</td>
                <td>{c.stad ?? <span className="muted">—</span>}</td>
                <td>{c.provincie ?? <span className="muted">—</span>}</td>
                <td>
                  <span className="crm-chips">
                    {(c.behandelingen.length ? c.behandelingen : c.crm ? [c.crm] : []).map((b) => <span key={b} className="crm-chip">{b}</span>)}
                    {c.tags.map((t) => <span key={`t-${t}`} className="crm-chip crm-chip--tag">{t}</span>)}
                  </span>
                </td>
                <td className="small">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
