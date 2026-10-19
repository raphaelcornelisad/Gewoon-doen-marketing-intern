import "server-only";
import { db } from "../supabase/server";

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Gebruiker van het CRM: setter (koude acquisitie) of salesmedewerker. */
export interface AcqSetter {
  id: string;
  naam: string;
  email: string;
  /** Oude persoonlijke Calendly-code (optioneel; nieuwe boekingen gaan via een boekingsreferentie) */
  utm_source: string | null;
  start_datum: string;
  actief: boolean;
  rol: "setter" | "sales";
}

export async function acqSetters(): Promise<AcqSetter[]> {
  return (check(await db().from("acq_setters").select("*").order("naam")) ?? []) as AcqSetter[];
}

export async function acqSetterByEmail(email: string): Promise<AcqSetter | null> {
  return check(await db().from("acq_setters").select("*").eq("email", email.trim().toLowerCase()).eq("actief", true).maybeSingle()) as AcqSetter | null;
}
