import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reactListByToken } from "@/lib/reactivatie/server";
import { ClinicChecklist } from "../../kliniek/[token]/clinic-checklist";

export const metadata: Metadata = { title: "Reactivatie · Gewoon Doen Marketing", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReactPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const l = await reactListByToken(token);
  if (!l) notFound();
  return (
    <ClinicChecklist
      token={token}
      kliniek={l.clinic.naam}
      periode=""
      items={l.items_json.map(({ id, naam, campagne, verschenen }) => ({ id, naam, campagne, verschenen }))}
      locked={l.locked}
      ingediend={!!l.submitted_at}
      apiBase="/api/reactivatie"
      eyebrow="Reactivatie"
      intro="Geef per klant aan of ze bij jullie op locatie is geweest. Je kunt tussendoor opslaan en later verder gaan. Klik op Indienen als je klaar bent."
      telLabel="op locatie geweest"
    />
  );
}
