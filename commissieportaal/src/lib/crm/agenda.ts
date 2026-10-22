import "server-only";
import { db } from "../supabase/server";
import { all, type CrmUser } from "./server";
import { huidigeCrmId } from "./werkruimte";

export interface AgendaItem {
  id: string;
  type: "kennismaking" | "salesgesprek";
  status: string;
  start_op: string;
  setter_id: string | null;
  attributie: string;
  contact: { id: string; salon_naam: string; contactpersoon: string | null; eigenaar_id: string | null };
  sales: { fase: string; verkoper_id: string | null } | null;
}

/** Alleen afspraken die aan CRM-leads gekoppeld zijn (geen privéafspraken). Rechten per rol, server-side. */
export async function agenda(user: CrmUser, van: string, tot: string): Promise<AgendaItem[]> {
  const crm = await huidigeCrmId();
  const rows = await all<Omit<AgendaItem, "sales">>((f, t) =>
    db()
      .from("crm_appointments")
      .select("id, type, status, start_op, setter_id, attributie, contact:crm_contacts!inner(id, salon_naam, contactpersoon, eigenaar_id)")
      .eq("contact.crm_id", crm)
      .gte("start_op", van)
      .lt("start_op", tot)
      .order("start_op")
      .order("id")
      .range(f, t),
  );
  const ids = [...new Set(rows.map((r) => r.contact.id))];
  const sales = new Map<string, { fase: string; verkoper_id: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db().from("crm_opportunities").select("contact_id, fase, verkoper_id").eq("pijplijn", "sales").in("contact_id", ids.slice(i, i + 300));
    for (const o of (data ?? []) as { contact_id: string; fase: string; verkoper_id: string | null }[]) sales.set(o.contact_id, o);
  }
  return rows
    .map((r) => ({ ...r, sales: sales.get(r.contact.id) ?? null }))
    .filter((r) => {
      if (user.rol === "admin") return true;
      if (user.rol === "sales") return r.sales?.verkoper_id === user.setter.id;
      return r.setter_id === user.setter.id || r.contact.eigenaar_id === user.setter.id;
    });
}

export interface Herinnering {
  id: string;
  soort: "taak" | "terugbellen";
  start_op: string;
  titel: string;
  setter_id: string | null;
  contact: { id: string; salon_naam: string } | null;
  inGoogle: boolean;
}

/** Open taken en terugbelmomenten (dezelfde die naar Google Agenda gaan). Setters zien alleen hun eigen. */
export async function herinneringen(user: CrmUser, van: string, tot: string): Promise<Herinnering[]> {
  const crm = await huidigeCrmId();
  const eigen = user.rol === "admin" ? null : user.setter.id;
  let tq = db().from("crm_tasks").select("id, titel, vervalt_op, toegewezen_aan, google_event_id, contact:crm_contacts!inner(id, salon_naam, crm_id)").is("gedaan_op", null).gte("vervalt_op", van).lt("vervalt_op", tot).eq("contact.crm_id", crm);
  if (eigen) tq = tq.eq("toegewezen_aan", eigen);
  let cq = db().from("crm_contacts").select("id, salon_naam, volgende_opvolging_op, eigenaar_id, google_event_id").eq("crm_id", crm).eq("niet_benaderen", false).gte("volgende_opvolging_op", van).lt("volgende_opvolging_op", tot);
  if (eigen) cq = cq.eq("eigenaar_id", eigen);
  const [t, c] = await Promise.all([tq.order("vervalt_op").limit(1000), cq.order("volgende_opvolging_op").limit(1000)]);
  const taken = (t.data ?? []) as unknown as { id: string; titel: string; vervalt_op: string; toegewezen_aan: string | null; google_event_id: string | null; contact: { id: string; salon_naam: string } | null }[];
  const leads = (c.data ?? []) as { id: string; salon_naam: string; volgende_opvolging_op: string; eigenaar_id: string | null; google_event_id: string | null }[];
  return [
    ...taken.map((x) => ({ id: `t-${x.id}`, soort: "taak" as const, start_op: x.vervalt_op, titel: x.titel, setter_id: x.toegewezen_aan, contact: x.contact ? { id: x.contact.id, salon_naam: x.contact.salon_naam } : null, inGoogle: !!x.google_event_id })),
    ...leads.map((x) => ({ id: `c-${x.id}`, soort: "terugbellen" as const, start_op: x.volgende_opvolging_op, titel: "Terugbellen", setter_id: x.eigenaar_id, contact: { id: x.id, salon_naam: x.salon_naam }, inGoogle: !!x.google_event_id })),
  ];
}
