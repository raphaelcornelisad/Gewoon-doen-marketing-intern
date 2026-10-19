import type { Metadata } from "next";
import { StatementView } from "@/components/acquisitie/statement";
import { periodsFor, setterOverview } from "@/lib/acquisitie/server";
import { requireAcqSetter } from "@/lib/auth/acq-session";

export const metadata: Metadata = { title: "Mijn gesprekken · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

export default async function AcqPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const setter = await requireAcqSetter();
  const periods = periodsFor(setter);
  const { p } = await searchParams;
  const periode = periods.find((x) => x.start === p) ?? periods[0];
  const o = await setterOverview(setter, periode);
  return (
    <>
      <div className="admin-bar">
        <span className="admin-bar__links"><a href="/crm">CRM</a><strong>Mijn commissie</strong></span>
        <span className="admin-bar__right">
          <span className="muted">{setter.email}</span>
          <form action="/api/acquisitie/logout" method="post"><button type="submit" className="linkbutton">Uitloggen</button></form>
        </span>
      </div>
      <StatementView o={o} admin={false} basePath="/acquisitie" periods={periods} />
      <p className="muted small">
        Gesprekken komen elk uur uit Calendly. Plan altijd in via je eigen link (met jouw code), anders telt het gesprek niet voor jou.
      </p>
    </>
  );
}
