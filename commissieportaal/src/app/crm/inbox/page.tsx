import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { BerichtKnop } from "@/components/crm/lead-balk";
import { Live } from "@/components/crm/live";
import { MarkeerGelezen } from "@/components/crm/inbox-gelezen";
import { inbox } from "@/lib/crm/berichten";
import { contactDetail, requireCrmUser } from "@/lib/crm/server";
import { twilioStatus } from "@/lib/crm/twilio";
import { wanneer } from "../format";

export const metadata: Metadata = { title: "Inbox · CRM" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { wachtrij: "in wachtrij", verzonden: "verzonden", afgeleverd: "afgeleverd", gelezen: "gelezen", mislukt: "mislukt", ontvangen: "ontvangen", handmatig: "handmatig (eigen app)" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const user = await requireCrmUser();
  const { lead } = await searchParams;
  const [lijst, detail] = await Promise.all([inbox(user), lead ? contactDetail(lead, user) : Promise.resolve(null)]);
  const st = twilioStatus();
  return (
    <>
      <CrmBar user={user} actief="/crm/inbox" />
      <Live sec={20} />
      <h1>Inbox</h1>
      {!st.whatsapp && !st.sms && (
        <div className="notice">
          <strong>WhatsApp en sms via het CRM wachten op aansluiting (Twilio)</strong>
          <span className="small">Inkomende berichten verschijnen hier zodra Twilio is gekoppeld. Tot die tijd zie je alleen berichten die handmatig via de eigen app zijn verstuurd.</span>
        </div>
      )}
      <div className="crm-inbox">
        <section className="card crm-inbox__lijst" style={{ padding: 0 }}>
          {lijst.length === 0 && <p className="muted" style={{ padding: 12 }}>Nog geen gesprekken.</p>}
          {lijst.map((g) => (
            <Link key={g.contact.id} href={`/crm/inbox?lead=${g.contact.id}`} aria-current={lead === g.contact.id ? "page" : undefined}>
              <span className="crm-toolbar">
                <strong>{g.contact.salon_naam}</strong>
                {g.open > 0 && <span className="crm-badge crm-badge--inline">{g.open}</span>}
              </span>
              <span className="small muted">{g.laatste.richting === "in" ? "← " : "→ "}{g.laatste.tekst.slice(0, 80)}</span>
              <span className="small muted">{wanneer(g.laatste.created_at)} · {STATUS[g.laatste.status] ?? g.laatste.status}</span>
            </Link>
          ))}
        </section>
        <section className="card crm-form">
          {!detail ? (
            <p className="muted">Kies een gesprek.</p>
          ) : (
            <>
              <div className="crm-toolbar">
                <Link href={`/crm/lead/${detail.contact.id}?tab=berichten`}><strong>{detail.contact.salon_naam}</strong></Link>
                {!detail.contact.niet_benaderen && <BerichtKnop contactId={detail.contact.id} />}
              </div>
              <MarkeerGelezen contactId={detail.contact.id} />
              <div className="crm-bubbels">
                {detail.berichten.map((m) => (
                  <div key={m.id} className={`crm-bubbel${m.richting === "uit" ? " crm-bubbel--uit" : ""}`}>
                    {m.tekst}
                    <small>
                      {m.kanaal === "whatsapp" ? "WhatsApp" : "Sms"} · {wanneer(m.created_at)} · <span className={m.status === "mislukt" ? "crm-status--mislukt" : undefined}>{STATUS[m.status] ?? m.status}</span>
                      {m.fout && ` (${m.fout})`}
                    </small>
                  </div>
                ))}
              </div>
              {detail.taken.filter((t) => !t.gedaan_op).length > 0 && <p className="small">Open taken: {detail.taken.filter((t) => !t.gedaan_op).map((t) => t.titel).join(", ")}</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}
