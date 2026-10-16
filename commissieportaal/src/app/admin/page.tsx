import type { Metadata } from "next";
import Link from "next/link";
import { AdminBar } from "@/components/admin/admin-bar";
import { formatDateTime, STATUS_LABEL } from "@/lib/admin/format";
import { listSubmissions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatEuro } from "@/lib/commission";

export const metadata: Metadata = { title: "Admin · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const admin = await requireAdmin();
  const rows = await listSubmissions();
  const open = rows.filter((r) => r.status === "te_controleren").length;

  return (
    <>
      <AdminBar email={admin.email} />
      <h1>Indieningen</h1>
      <p className="lead">
        {rows.length === 0
          ? "Nog geen indieningen. Zodra een setter een lijst indient, verschijnt die hier."
          : `${rows.length} indieningen · ${open} moeten gecontroleerd worden`}
      </p>

      {rows.length > 0 && (
        <ul className="sub-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/indiening/${r.id}`} className="sub-card">
                <span className="sub-card__top">
                  <span className="sub-card__name">
                    {r.setter.naam}
                    {r.setter.is_nieuw && <span className="tag tag--nieuw">Nieuwe setter</span>}
                  </span>
                  <span className="sub-card__amount">{formatEuro(r.commission_json.totaalCents)}</span>
                </span>
                <span className="muted small">{r.setter.email}</span>
                <span className="sub-card__meta">
                  <span className={`pill pill--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  <span className="muted small">
                    {r.period.label} · {r.counts_json.totaal.groen} groen · ingediend {formatDateTime(r.submitted_at)}
                  </span>
                </span>
                <span className="sub-card__cta">Controleren →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
