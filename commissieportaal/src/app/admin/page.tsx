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
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Setter</th>
                <th>Periode</th>
                <th>Status</th>
                <th className="num">Groen</th>
                <th className="num">Bedrag</th>
                <th>Ingediend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/indiening/${r.id}`} className="strong-link">
                      {r.setter.naam}
                    </Link>
                    {r.setter.is_nieuw && <span className="tag tag--nieuw">Nieuwe setter</span>}
                    <div className="muted small">{r.setter.email}</div>
                  </td>
                  <td>{r.period.label}</td>
                  <td>
                    <span className={`pill pill--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="num">{r.counts_json.totaal.groen}</td>
                  <td className="num strong">{formatEuro(r.commission_json.totaalCents)}</td>
                  <td className="muted">{formatDateTime(r.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
