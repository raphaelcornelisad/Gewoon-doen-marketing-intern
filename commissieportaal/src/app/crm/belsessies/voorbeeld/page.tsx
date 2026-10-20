import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { SessieBalk } from "@/components/crm/sessie-balk";
import { acqSetters } from "@/lib/acquisitie/server";
import { requireBeheer } from "@/lib/auth/beheer";
import { requireCrmUser, type CrmUser } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Voorbeeld setter · CRM" };
export const dynamic = "force-dynamic";

/** Admin ziet het belscherm zoals een setter het ziet. Alles is oefening: niets wordt opgeslagen. */
export default async function Voorbeeld() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/belsessies/voorbeeld");
  const setter = (await acqSetters()).find((s) => s.rol === "setter" && s.actief);
  if (!setter) redirect("/crm/belsessies");
  const alsSetter: CrmUser = { rol: "setter", email: setter.email, setter };
  return (
    <>
      <div className="crm-voorbeeld">
        <strong>Voorbeeld: zo ziet {setter.naam} het.</strong> Alles hieronder is oefening; er wordt niets opgeslagen of aan {setter.naam} toegeschreven.{" "}
        <Link href="/crm/belsessies">← Terug naar Belsessies</Link>
      </div>
      <CrmBar user={alsSetter} actief="/crm/bellen" />
      <h1>Bellen</h1>
      <p className="lead">Start een belsessie: het CRM opent steeds de eerstvolgende geschikte lead (achterstallige opvolging eerst, dan je eigen leads, dan nieuwe). Iedere lead wordt tijdens het bellen voor jou gereserveerd.</p>
      <SessieBalk start={null} leadId={null} demo />
      <section className="card">
        <h2>Hoe het telt</h2>
        <ul>
          <li><strong>Gebeld</strong>: elke belpoging waarvan de setter de uitkomst vastlegt.</li>
          <li><strong>Gesproken</strong>: alle uitkomsten behalve &quot;Niet opgenomen&quot; en &quot;Ongeldig nummer&quot;.</li>
          <li><strong>WAFU</strong>: leads die een WhatsApp kregen via het CRM, of de uitkomst &quot;Opvolgen via WhatsApp&quot; (één keer per lead).</li>
          <li><strong>Ingepland</strong>: uitkomst &quot;Ingepland&quot;.</li>
          <li><strong>Tijd</strong>: van start tot indienen, zonder pauzes.</li>
        </ul>
        <p className="small muted">Op het bord CRM Outbound ziet de setter rechtsboven ook de knop &quot;📞 Start belsessie&quot;, en in het menu het item Bellen.</p>
      </section>
    </>
  );
}
