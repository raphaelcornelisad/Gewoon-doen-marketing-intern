import "server-only";
import { db } from "../supabase/server";
import { all, type CrmUser } from "./server";

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
  const rows = await all<Omit<AgendaItem, "sales">>((f, t) =>
    db()
      .from("crm_appointments")
      .select("id, type, status, start_op, setter_id, attributie, contact:crm_contacts!inner(id, salon_naam, contactpersoon, eigenaar_id)")
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
