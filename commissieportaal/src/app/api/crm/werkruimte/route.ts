import { cookies } from "next/headers";
import { crmRoute } from "@/lib/crm/api";
import { CrmError } from "@/lib/crm/server";
import { CRM_COOKIE, werkruimtes } from "@/lib/crm/werkruimte";
import { db } from "@/lib/supabase/server";

const bewaar = async (id: string) =>
  (await cookies()).set(CRM_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });

/** Wisselen van CRM (iedereen) of een nieuw CRM aanmaken (alleen admin met ontgrendeld beheer). */
export async function POST(req: Request) {
  const body = (await req.clone().json().catch(() => ({}))) as { id?: string; naam?: string };
  if (typeof body.naam === "string") {
    return crmRoute<{ naam: string }>(
      req,
      async (_user, { naam }) => {
        const n = naam.trim().replace(/\s+/g, " ");
        if (n.length < 2 || n.length > 60) throw new CrmError("Geef het CRM een naam van 2 tot 60 tekens.");
        if ((await werkruimtes()).some((w) => w.naam.toLowerCase() === n.toLowerCase())) throw new CrmError("Er bestaat al een CRM met deze naam.");
        const { data, error } = await db().from("crm_werkruimtes").insert({ naam: n }).select("id").single();
        if (error) throw new Error(error.message);
        await bewaar((data as { id: string }).id);
      },
      { beheer: true },
    );
  }
  return crmRoute<{ id: string }>(req, async (_user, { id }) => {
    if (!(await werkruimtes()).some((w) => w.id === id)) throw new CrmError("Onbekend CRM.", 404);
    await bewaar(id);
  });
}
