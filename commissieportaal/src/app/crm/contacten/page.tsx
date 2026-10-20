import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { ContactenTabel, type ContactRij } from "@/components/crm/contacten";
import { requireBeheer } from "@/lib/auth/beheer";
import { faseLabel } from "@/lib/crm/core";
import { all, requireCrmUser } from "@/lib/crm/server";
import { werkruimtes } from "@/lib/crm/werkruimte";
import { db } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacten · CRM" };
export const dynamic = "force-dynamic";

type Rij = {
  id: string;
  crm_id: string;
  salon_naam: string;
  contactpersoon: string | null;
  telefoon: string | null;
  telefoon_norm: string | null;
  email: string | null;
  stad: string | null;
  provincie: string | null;
  behandelingen: string[];
  tags: string[];
  niet_benaderen: boolean;
};

/** Alle contacten uit alle CRM's (alleen admin, achter het beheerwachtwoord). */
export default async function Contacten() {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  await requireBeheer("/crm/contacten");
  const [rijen, fases, crms] = await Promise.all([
    all<Rij>((f, t) =>
      db().from("crm_contacts").select("id, crm_id, salon_naam, contactpersoon, telefoon, telefoon_norm, email, stad, provincie, behandelingen, tags, niet_benaderen").order("salon_naam").order("id").range(f, t),
    ),
    all<{ contact_id: string; fase: string }>((f, t) => db().from("crm_opportunities").select("contact_id, fase").eq("pijplijn", "outbound").order("id").range(f, t)),
    werkruimtes(),
  ]);
  const fase = new Map(fases.map((o) => [o.contact_id, o.fase]));
  const crmNaam = new Map(crms.map((w) => [w.id, w.naam]));
  const contacten: ContactRij[] = rijen.map((r) => ({
    id: r.id,
    bedrijf: r.salon_naam,
    eigenaar: r.contactpersoon,
    telefoon: r.telefoon_norm ?? r.telefoon,
    email: r.email,
    stad: r.stad,
    provincie: r.provincie,
    crm: crmNaam.get(r.crm_id) ?? "",
    behandelingen: r.behandelingen ?? [],
    tags: r.tags ?? [],
    status: fase.has(r.id) ? faseLabel("outbound", fase.get(r.id)!) : "",
    geblokkeerd: r.niet_benaderen,
  }));
  return (
    <>
      <CrmBar user={user} actief="/crm/contacten" />
      <h1>Contacten</h1>
      <p className="lead">Alle contacten uit alle CRM&apos;s. Klik op een naam om de leadkaart te openen.</p>
      <ContactenTabel contacten={contacten} />
    </>
  );
}
