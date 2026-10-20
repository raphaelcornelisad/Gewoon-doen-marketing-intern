import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { ReviewActies } from "@/components/crm/review-acties";
import { acqSetters } from "@/lib/acquisitie/server";
import { requireBeheer } from "@/lib/auth/beheer";
import { requireCrmUser, reviewItems } from "@/lib/crm/server";
import { wanneer } from "../format";

export const metadata: Metadata = { title: "Beoordelen · CRM" };
export const dynamic = "force-dynamic";

const TITEL: Record<string, string> = { duplicaat: "Mogelijk dubbele lead", boeking_zonder_lead: "Boeking zonder bekende lead", attributie: "Boeking zonder setter-toeschrijving" };

export default async function Beoordelen() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/beoordelen");
  const [items, setters] = await Promise.all([reviewItems(), acqSetters()]);
  const lijst = setters.filter((s) => s.actief && s.rol === "setter").map((s) => ({ id: s.id, naam: s.naam }));
  return (
    <>
      <CrmBar user={user} actief="/crm/beoordelen" open={{ beoordelen: items.length }} />
      <h1>Beoordelen</h1>
      <p className="lead">Twijfelgevallen die het CRM bewust niet zelf beslist: dubbele leads en boekingen waarbij lead of setter niet zeker is. Er wordt nooit willekeurig commissie toegekend.</p>
      {items.length === 0 && <p className="muted">Niets te beoordelen.</p>}
      {items.map((r) => {
        const info = r.info as { reden?: string; naam?: string; email?: string; telefoon?: string; start?: string; type?: string };
        return (
          <section key={r.id} className="card crm-form">
            <div className="crm-toolbar">
              <strong>{TITEL[r.soort] ?? r.soort}</strong>
              <span className="small muted">{wanneer(r.created_at)}</span>
            </div>
            {r.soort === "duplicaat" && (
              <div className="crm-grid">
                {[["Nieuw geïmporteerd", r.contact], ["Bestaand", r.ander]].map(([l, c]) => {
                  const x = c as typeof r.contact;
                  return x ? (
                    <div key={l as string}>
                      <span className="small muted">{l as string}</span>
                      <div><Link href={`/crm/lead/${x.id}`}>{x.salon_naam}</Link></div>
                      <div className="small">{[x.stad, x.telefoon, x.website].filter(Boolean).join(" · ")}</div>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            {r.soort === "boeking_zonder_lead" && (
              <span className="small">{info.naam ?? "?"} · {info.email ?? "geen e-mail"} · {info.telefoon ?? "geen telefoon"} · {info.type} op {info.start ? wanneer(info.start) : "?"}</span>
            )}
            {r.soort === "attributie" && r.contact && <span className="small"><Link href={`/crm/lead/${r.contact.id}?tab=afspraken`}>{r.contact.salon_naam}</Link> · {info.reden}</span>}
            {info.reden && r.soort === "duplicaat" && <span className="small muted">Reden: {info.reden}</span>}
            <ReviewActies id={r.id} soort={r.soort} setters={lijst} />
          </section>
        );
      })}
    </>
  );
}
