import "server-only";
import { check, ensureSales, log } from "../crm/server";
import { db } from "../supabase/server";

/** Overdracht van "Call geboekt" naar de sales-pipeline staat alleen aan met IG_SALES_OVERDRACHT=aan. */
export const overdrachtAan = () => process.env.IG_SALES_OVERDRACHT === "aan";

export type OverdrachtStatus = "uit" | "niet_call" | "aangemaakt" | "gekoppeld" | "al_gekoppeld";

interface Gesprek {
  id: string;
  account_id: string;
  fase: string;
  contact_id: string | null;
  lead_ig_id: string | null;
  lead_gebruikersnaam: string | null;
  calendly_invitee_uri: string | null;
}

const profielUrl = (u: string | null) => (u && /^[A-Za-z0-9._]{1,30}$/.test(u) ? `https://www.instagram.com/${u}/` : null);

/**
 * Een gesprek in "Call geboekt" wordt een lead in de sales-pipeline op "Ingepland".
 * Bestaand contact (al gekoppeld, via de Calendly-afspraak, of via het Instagram-profiel) wordt hergebruikt;
 * anders komt er een nieuw contact. De saleskaart maakt ensureSales, zoals bij outbound → Ingepland.
 * Idempotent: een tweede keer maakt geen tweede contact of kaart en logt niet opnieuw.
 */
export async function draagOverAanSales(threadId: string, door: string, setterId: string | null): Promise<{ status: OverdrachtStatus; contactId?: string }> {
  if (!overdrachtAan()) return { status: "uit" };
  const t = check(
    await db().from("ig_threads").select("id, account_id, fase, contact_id, lead_ig_id, lead_gebruikersnaam, calendly_invitee_uri").eq("id", threadId).maybeSingle(),
  ) as Gesprek | null;
  if (!t || t.fase !== "call_geboekt") return { status: "niet_call" };

  if (t.contact_id) {
    await ensureSales(t.contact_id, setterId, door);
    return { status: "al_gekoppeld", contactId: t.contact_id };
  }

  const naam = t.lead_gebruikersnaam ? `@${t.lead_gebruikersnaam}` : `Instagram-lead ${t.lead_ig_id ?? t.id.slice(0, 8)}`;
  const url = profielUrl(t.lead_gebruikersnaam);
  let contactId: string | null = null;
  let status: OverdrachtStatus = "gekoppeld";

  if (t.calendly_invitee_uri) {
    const a = check(await db().from("crm_appointments").select("contact_id").eq("calendly_invitee_uri", t.calendly_invitee_uri).maybeSingle()) as { contact_id: string } | null;
    contactId = a?.contact_id ?? null;
  }
  if (!contactId && url) {
    const c = check(await db().from("crm_contacts").select("id").eq("bron_url", url).order("created_at", { ascending: false }).limit(1).maybeSingle()) as { id: string } | null;
    contactId = c?.id ?? null;
  }
  if (!contactId) {
    const acc = check(await db().from("ig_accounts").select("crm_id").eq("id", t.account_id).maybeSingle()) as { crm_id: string | null } | null;
    const c = check(
      await db()
        .from("crm_contacts")
        .insert({
          salon_naam: naam,
          bron: "instagram",
          bron_url: url,
          eigenaar_id: setterId,
          oorspronkelijke_setter_id: setterId,
          ...(acc?.crm_id ? { crm_id: acc.crm_id } : {}),
        })
        .select("id")
        .single(),
    ) as { id: string };
    contactId = c.id;
    status = "aangemaakt";
    // Zoals een outbound-lead die op Ingepland komt: outbound-kaart op Ingepland, daarna de saleskaart.
    check(await db().from("crm_opportunities").insert({ contact_id: contactId, pijplijn: "outbound", fase: "ingepland" }));
    await log({ contact_id: contactId, door, setter_id: setterId, type: "import", tekst: "Aangemaakt vanuit Instagram (call geboekt)" });
  }

  await ensureSales(contactId, setterId, door);
  // Alleen koppelen als er nog niets gekoppeld is (twee gelijktijdige overdrachten winnen niet van elkaar).
  const r = check(await db().from("ig_threads").update({ contact_id: contactId, updated_at: new Date().toISOString() }).eq("id", t.id).is("contact_id", null).select("id")) as { id: string }[];
  if (r.length) await log({ contact_id: contactId, door, setter_id: setterId, type: "instagram", pijplijn: "sales", tekst: `Call geboekt via Instagram (${naam}); doorgezet naar sales, fase Ingepland` });
  return { status, contactId };
}
