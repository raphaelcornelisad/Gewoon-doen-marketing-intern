import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AanvraagKnoppen } from "@/components/crm/aanvraag-knoppen";
import { CrmBar } from "@/components/crm/crm-bar";
import { requireBeheer } from "@/lib/auth/beheer";
import { aanvragen } from "@/lib/crm/aanvragen";
import { requireCrmUser } from "@/lib/crm/server";
import { wanneer } from "../format";

export const metadata: Metadata = { title: "Accountaanvragen · CRM" };
export const dynamic = "force-dynamic";

export default async function Aanvragen() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/aanvragen");
  const lijst = await aanvragen();
  const open = lijst.filter((a) => a.status === "open");
  const klaar = lijst.filter((a) => a.status !== "open");
  return (
    <>
      <CrmBar user={user} actief="/crm/aanvragen" />
      <h1>Accountaanvragen</h1>
      <p className="lead">Mensen die zich aanmelden via sales.gewoondoenmarketing.nl/crm/aanmelden. Pas na goedkeuring kunnen ze inloggen.</p>
      <section className="card">
        <h2>Open ({open.length})</h2>
        {open.length === 0 && <p className="muted">Geen openstaande aanvragen.</p>}
        <div className="crm-form">
          {open.map((a) => (
            <div key={a.id} className="card crm-aanvraag">
              <div>
                <strong>{a.naam}</strong> · <a href={`mailto:${a.email}`}>{a.email}</a>{a.telefoon ? ` · ${a.telefoon}` : ""}
                <div className="small muted">Aangevraagd {wanneer(a.created_at)} · wil {a.rol === "sales" ? "salesmedewerker" : "setter"} worden</div>
                {a.toelichting && <p className="small" style={{ margin: "6px 0 0" }}>{a.toelichting}</p>}
              </div>
              <AanvraagKnoppen id={a.id} rol={a.rol} />
            </div>
          ))}
        </div>
      </section>
      {klaar.length > 0 && (
        <section className="card">
          <h2>Eerder beoordeeld</h2>
          <table className="table">
            <thead><tr><th>Naam</th><th>E-mail</th><th>Status</th><th>Beoordeeld</th></tr></thead>
            <tbody>
              {klaar.map((a) => (
                <tr key={a.id}><td>{a.naam}</td><td>{a.email}</td><td>{a.status === "goedgekeurd" ? "✓ Goedgekeurd" : "Afgewezen"}</td><td className="small">{a.beoordeeld_op ? wanneer(a.beoordeeld_op) : ""}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
