import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { waLink } from "@/components/crm/icons";
import { requireBeheer } from "@/lib/auth/beheer";
import { check, requireCrmUser } from "@/lib/crm/server";
import { db } from "@/lib/supabase/server";
import { wanneer } from "../format";

export const metadata: Metadata = { title: "Funnel-aanvragen · CRM" };
export const dynamic = "force-dynamic";

type Rij = { id: string; salon: string; funnel: string; voornaam: string; achternaam: string | null; email: string | null; telefoon: string | null; telefoon_norm: string | null; aanbod: string | null; created_at: string };

export default async function Funnels() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/funnels");
  const rijen = (check(await db().from("funnel_leads").select("id, salon, funnel, voornaam, achternaam, email, telefoon, telefoon_norm, aanbod, created_at").order("created_at", { ascending: false }).limit(500)) ?? []) as Rij[];
  return (
    <>
      <CrmBar user={user} actief="/crm/funnels" />
      <h1>Funnel-aanvragen</h1>
      <p className="lead">Klanten die via een salonfunnel hun gegevens achterlieten voordat ze naar de boekingspagina gingen. Funnel bekijken: <a href="/f/uvacare" target="_blank" rel="noreferrer">UvaCare</a>.</p>
      <section className="card" style={{ overflowX: "auto" }}>
        {rijen.length === 0 ? (
          <p className="muted">Nog geen aanvragen.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Wanneer</th><th>Salon</th><th>Naam</th><th>Telefoon</th><th>E-mail</th><th>Aanbod</th></tr></thead>
            <tbody>
              {rijen.map((r) => {
                const wa = waLink(r.telefoon_norm);
                return (
                  <tr key={r.id}>
                    <td>{wanneer(r.created_at)}</td>
                    <td>{r.salon}</td>
                    <td>{[r.voornaam, r.achternaam].filter(Boolean).join(" ")}</td>
                    <td>{r.telefoon_norm ? <><a href={`tel:${r.telefoon_norm}`}>{r.telefoon}</a>{wa && <> · <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a></>}</> : (r.telefoon ?? "—")}</td>
                    <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                    <td className="small">{r.aanbod ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
