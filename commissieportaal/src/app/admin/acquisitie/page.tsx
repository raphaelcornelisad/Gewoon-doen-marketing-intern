import type { Metadata } from "next";
import Link from "next/link";
import { SyncButton } from "@/components/acquisitie/admin-actions";
import { AdminBar } from "@/components/admin/admin-bar";
import { acqSetters, periodsFor, setterOverview } from "@/lib/acquisitie/server";
import { requireAdmin } from "@/lib/auth/session";
import { formatEuro } from "@/lib/commission";

export const metadata: Metadata = { title: "Acquisitie · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

export default async function AdminAcq() {
  const admin = await requireAdmin();
  const setters = await acqSetters();
  const rows = await Promise.all(setters.map(async (s) => setterOverview(s, periodsFor(s)[0])));
  return (
    <>
      <AdminBar email={admin.email} />
      <h1>Acquisitie</h1>
      <p className="lead">Commissie op basis van Calendly. Lopende periode per setter.</p>
      <div><SyncButton /></div>
      <ul className="sub-list">
        {rows.map((o) => (
          <li key={o.setter.id}>
            <Link href={`/admin/acquisitie/${o.setter.id}`} className="sub-card">
              <span className="sub-card__top">
                <span className="sub-card__name">{o.setter.naam}</span>
                <span className="sub-card__amount">{formatEuro(o.statement.totaalCents)}</span>
              </span>
              <span className="muted small">utm_source={o.setter.utm_source} · {o.setter.email}</span>
              <span className="sub-card__meta">
                <span className="pill pill--te_controleren">{o.periode.label}</span>
                <span className="muted small">{o.statement.verschenen.length} verschenen · {o.statement.closes.length} closes</span>
              </span>
              <span className="sub-card__cta">Bekijken →</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
