import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { ImportForm } from "@/components/crm/lead-actions";
import { requireBeheer } from "@/lib/auth/beheer";
import { requireCrmUser } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Importeren · CRM" };
export const dynamic = "force-dynamic";

export default async function Import() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/import");
  return (
    <>
      <CrmBar user={user} actief="/crm/import" />
      <h1>Leads importeren</h1>
      <p className="lead">Nieuwe leads komen in koude acquisitie bij Nieuw. Bestaande leads worden overgeslagen; twijfelgevallen komen in Beoordelen.</p>
      <section className="card">
        <h2>Leads verzamelen</h2>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Zoek in <strong>Outscraper</strong> (Google Maps Scraper) of <strong>Apify</strong> (Google Maps Scraper) op bijvoorbeeld “schoonheidssalon” of “huidkliniek” plus een plaats of provincie.</li>
          <li>Exporteer als <strong>CSV</strong> en upload hieronder. Kolommen als name/title, phone, site/website, full_address, city, postal_code, type/categoryName, subtypes, email_1, place_id en location_link worden automatisch herkend.</li>
          <li>Een eigen lijst kan ook: eerste rij met kopjes zoals Salonnaam, Telefoon, E-mail, Website, Stad, Provincie, Type, Behandeling.</li>
        </ol>
        <p className="small muted">Telefoonnummers worden omgezet naar +31-formaat. Ontdubbelen gebeurt op telefoon, e-mail en websitedomein; zelfde naam en plaats met een ander nummer wordt een twijfelgeval. De bron en importdatum worden bewaard. Een geïmporteerd telefoonnummer is geen WhatsApp-toestemming.</p>
      </section>
      <ImportForm />
    </>
  );
}
