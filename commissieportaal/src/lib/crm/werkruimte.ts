import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../supabase/server";

export const CRM_COOKIE = "gdm_crm";

export interface Werkruimte {
  id: string;
  naam: string;
}

/** Alle CRM's, oudste eerst (het eerste is de standaard). */
export const werkruimtes = cache(async (): Promise<Werkruimte[]> => {
  const { data, error } = await db().from("crm_werkruimtes").select("id, naam").order("created_at").order("naam");
  if (error) throw new Error(error.message);
  return (data ?? []) as Werkruimte[];
});

/** Het CRM dat de gebruiker nu open heeft (cookie), anders het eerste. */
export const huidigeWerkruimte = cache(async (): Promise<Werkruimte> => {
  const lijst = await werkruimtes();
  if (!lijst.length) throw new Error("Er is nog geen CRM aangemaakt.");
  const gekozen = (await cookies()).get(CRM_COOKIE)?.value;
  return lijst.find((w) => w.id === gekozen) ?? lijst[0];
});

export const huidigeCrmId = async () => (await huidigeWerkruimte()).id;
