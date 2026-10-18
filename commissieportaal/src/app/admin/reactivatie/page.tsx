import type { Metadata } from "next";
import Link from "next/link";
import { AdminBar } from "@/components/admin/admin-bar";
import { NewCampaignForm } from "@/components/reactivatie/admin-actions";
import { requireAdmin } from "@/lib/auth/session";
import { campaignLists, campaigns } from "@/lib/reactivatie/server";

export const metadata: Metadata = { title: "Reactivatie · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

export default async function AdminReact() {
  const admin = await requireAdmin();
  const list = await campaigns();
  const stats = await Promise.all(
    list.map(async (c) => {
      const l = await campaignLists(c.id);
      return { c, salons: l.length, ingediend: l.filter((x) => x.submitted_at).length, namen: l.reduce((n, x) => n + x.items_json.length, 0) };
    }),
  );
  return (
    <>
      <AdminBar email={admin.email} />
      <h1>Reactivatie</h1>
      <p className="lead">Plak de sheetlinks. Groene leads worden per salon gezet; elke salon krijgt een eigen link om Ja/Nee aan te vinken.</p>
      <NewCampaignForm />
      <h2>Campagnes</h2>
      {!stats.length && <p className="muted">Nog geen campagnes.</p>}
      <ul className="sub-list">
        {stats.map(({ c, salons, ingediend, namen }) => (
          <li key={c.id}>
            <Link href={`/admin/reactivatie/${c.id}`} className="sub-card">
              <span className="sub-card__top">
                <span className="sub-card__name">{c.naam}</span>
                <span className="sub-card__amount">{ingediend}/{salons}</span>
              </span>
              <span className="muted small">{datum(c.created_at)} · {namen} namen · {c.bronnen.length} sheets</span>
              <span className="sub-card__cta">Bekijken →</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
