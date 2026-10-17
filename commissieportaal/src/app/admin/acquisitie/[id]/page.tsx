import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveAcq, SyncButton } from "@/components/acquisitie/admin-actions";
import { StatementView } from "@/components/acquisitie/statement";
import { AdminBar } from "@/components/admin/admin-bar";
import { acqSetters, periodsFor, setterOverview } from "@/lib/acquisitie/server";
import { requireAdmin } from "@/lib/auth/session";
import { formatEuro } from "@/lib/commission";

export const metadata: Metadata = { title: "Acquisitie · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

export default async function AdminAcqSetter({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const setter = (await acqSetters()).find((s) => s.id === id);
  if (!setter) notFound();
  const periods = periodsFor(setter);
  const { p } = await searchParams;
  const periode = periods.find((x) => x.start === p) ?? periods[0];
  const o = await setterOverview(setter, periode);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <AdminBar email={admin.email} />
      <div><SyncButton /></div>
      <StatementView o={o} admin basePath={`/admin/acquisitie/${setter.id}`} periods={periods} />
      {!o.goedgekeurd && (
        <section className="card">
          <h2>Goedkeuren</h2>
          <ApproveAcq setterId={setter.id} start={periode.start} bedrag={formatEuro(o.statement.totaalCents)} lopend={today < periode.eind} />
        </section>
      )}
      <p className="muted small">
        Setterportaal: <strong>commissie.gewoondoenmarketing.nl/acquisitie</strong> (inloggen met {setter.email}).
      </p>
      <p><Link href="/admin/acquisitie">← Terug</Link></p>
    </>
  );
}
