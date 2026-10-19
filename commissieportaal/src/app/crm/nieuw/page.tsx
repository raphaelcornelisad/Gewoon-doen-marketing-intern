import type { Metadata } from "next";
import { CrmBar } from "@/components/crm/crm-bar";
import { ContactForm } from "@/components/crm/lead-actions";
import { PROVINCIES } from "@/lib/crm/provincies";
import { requireCrmUser } from "@/lib/crm/server";

export const metadata: Metadata = { title: "Lead toevoegen · CRM" };
export const dynamic = "force-dynamic";

export default async function Nieuw() {
  const user = await requireCrmUser();
  return (
    <>
      <CrmBar user={user} actief="" />
      <h1>Lead toevoegen</h1>
      <p className="lead">De lead komt in Outbound bij Nieuw{user.setter ? " en staat op jouw naam" : ""}.</p>
      <section className="card" style={{ maxWidth: 640 }}>
        <ContactForm provincies={PROVINCIES} initial={{ salon_naam: "", contactpersoon: "", telefoon: "", email: "", website: "", stad: "", provincie: "", behandelingen: "" }} />
      </section>
    </>
  );
}
