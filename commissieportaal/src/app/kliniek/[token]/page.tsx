import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checklistByToken } from "@/lib/opkomst/server";
import { leesVoorbeeldToken, VOORBEELD, voorbeeldVoorKliniek } from "@/lib/opkomst/voorbeeld";
import { ClinicChecklist } from "./clinic-checklist";

export const metadata: Metadata = { title: "Opkomst bevestigen · Gewoon Doen Marketing", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function KliniekPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.startsWith(VOORBEELD)) {
    const id = leesVoorbeeldToken(token);
    const v = id ? await voorbeeldVoorKliniek(id) : null;
    if (!v || !v.items.length) notFound();
    return (
      <ClinicChecklist
        token={token}
        kliniek={v.kliniek}
        periode={`Afspraken ingepland van ${v.periode}`}
        items={v.items}
        locked={false}
        ingediend={false}
        voorbeeld
        eyebrow="Test · er wordt niets opgeslagen"
      />
    );
  }
  const c = await checklistByToken(token);
  if (!c) notFound();
  // Alleen naam van de lead en campagne naar de kliniek; geen setterinformatie.
  const items = c.items_json.map(({ id, naam, campagne, verschenen }) => ({ id, naam, campagne, verschenen }));
  return (
    <ClinicChecklist
      token={token}
      kliniek={c.clinic.naam}
      periode={`Afspraken ingepland van ${c.period.label}`}
      items={items}
      locked={c.locked}
      ingediend={!!c.submitted_at}
    />
  );
}
