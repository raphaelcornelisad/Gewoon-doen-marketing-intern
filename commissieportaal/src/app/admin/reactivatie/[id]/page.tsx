import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TestModeToggle } from "@/components/admin/actions";
import { AdminBar } from "@/components/admin/admin-bar";
import { SendButton } from "@/components/reactivatie/admin-actions";
import { requireAdmin } from "@/lib/auth/session";
import { campaignLists, campaigns, reactUrl } from "@/lib/reactivatie/server";
import { db } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reactivatie · Gewoon Doen Marketing" };
export const dynamic = "force-dynamic";

const wanneer = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

export default async function ReactCampaign({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const c = (await campaigns()).find((x) => x.id === id);
  if (!c) notFound();
  const [lists, s] = await Promise.all([campaignLists(id), db().from("settings").select("clinic_mail_test_mode").eq("id", 1).maybeSingle()]);
  const testmodus = (s.data as { clinic_mail_test_mode: boolean } | null)?.clinic_mail_test_mode ?? true;
  const tel = (f: (v: boolean | null) => boolean) => lists.reduce((n, l) => n + l.items_json.filter((i) => f(i.verschenen)).length, 0);
  const exp = (f: string) => `/api/admin/reactivatie/${id}/export?filter=${f}`;

  return (
    <>
      <AdminBar email={admin.email} />
      <p><Link href="/admin/reactivatie">← Reactivatie</Link></p>
      <h1>{c.naam}</h1>
      <p className="lead">
        {lists.length} salons · <strong>{tel((v) => v === true)}</strong> op locatie geweest · {tel((v) => v === false)} niet · {tel((v) => v === null)} open
      </p>
      <p>
        Export (CSV): <a href={exp("ja")}>Op locatie geweest</a> · <a href={exp("nee")}>Niet geweest</a> · <a href={exp("open")}>Open</a> · <a href={exp("alle")}>Alles</a>
      </p>
      <TestModeToggle aan={testmodus} />
      <div style={{ margin: "12px 0" }}>
        <SendButton campaignId={id} label={`Alle nog niet verstuurde lijsten versturen (${lists.filter((l) => !l.sent_at).length})`} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Salon</th><th className="num">Namen</th><th className="num">Ja</th><th className="num">Nee</th><th>Verstuurd</th><th>Ingediend</th><th></th></tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.clinic.naam}
                  <br />
                  <span className="small muted">{l.clinic.email_override || l.clinic.email || "geen e-mailadres"}</span>
                </td>
                <td className="num">{l.items_json.length}</td>
                <td className="num">{l.items_json.filter((i) => i.verschenen === true).length}</td>
                <td className="num">{l.items_json.filter((i) => i.verschenen === false).length}</td>
                <td className="small">{wanneer(l.sent_at)}{l.sent_to ? <><br /><span className="muted">{l.sent_to}</span></> : null}</td>
                <td className="small">{wanneer(l.submitted_at)}</td>
                <td className="small">
                  <a href={reactUrl(l.token)} target="_blank" rel="noreferrer">Bekijk lijst</a>
                  <br />
                  <SendButton campaignId={id} listId={l.id} label={l.sent_at ? "Opnieuw versturen" : "Versturen"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Bronnen</h2>
      <ul>
        {c.bronnen.map((b) => (
          <li key={b.url}><a href={b.url} target="_blank" rel="noreferrer">{b.titel}</a> ({b.groen} groen)</li>
        ))}
      </ul>
    </>
  );
}
