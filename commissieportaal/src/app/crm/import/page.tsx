import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { ImportForm, SyncButton } from "@/components/crm/lead-actions";
import { requireCrmUser } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Importeren · CRM" };
export const dynamic = "force-dynamic";

export default async function Import() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm/outbound");
  return (
    <>
      <CrmBar user={user} actief="/crm/import" />
      <h1>Leads importeren</h1>
      <p className="lead">Plak de link van een Google Sheet (gedeeld als “iedereen met de link”). Nieuwe leads komen in Outbound bij Nieuw.</p>
      <section className="card">
        <h2>Zo moet de sheet eruitzien</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Eerste rij = kopjes. Herkend worden o.a. <strong>Salonnaam</strong> (of Bedrijf), <strong>Telefoon</strong>, <strong>E-mail</strong>, <strong>Stad</strong> (of Plaats), <strong>Provincie</strong>, <strong>Behandeling</strong>, Contactpersoon, Website.</li>
          <li>Geen kolom Behandeling? Dan wordt de <strong>tabnaam</strong> de behandeling (bijv. tab “Laser”).</li>
          <li>Geen provincie? Die wordt automatisch bepaald op basis van de stad.</li>
          <li>Leads die al bestaan (zelfde telefoon of e-mail) worden overgeslagen. Je kunt dus gerust opnieuw importeren.</li>
        </ul>
      </section>
      <ImportForm />
      <section className="card">
        <h2>Calendly</h2>
        <p style={{ marginTop: 0 }}>Elk uur worden nieuwe boekingen van “Kennismaking gesprek” automatisch gekoppeld: de lead gaat naar Ingepland, komt in Sales en krijgt de tag van de setter (op basis van de UTM-code).</p>
        <SyncButton />
      </section>
    </>
  );
}
