import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmBar } from "@/components/crm/crm-bar";
import { getBeheerAdmin } from "@/lib/auth/beheer";
import { veiligPad } from "@/lib/auth/wachtwoord";
import { requireCrmUser } from "@/lib/crm/server";
import { db } from "@/lib/supabase/server";
import { BeheerSlot } from "./slot";

export const metadata: Metadata = { title: "Beheer · Gewoon Sales Doen" };
export const dynamic = "force-dynamic";

export default async function Beheer({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireCrmUser();
  if (user.rol !== "admin") redirect("/crm");
  const next = veiligPad((await searchParams).next, "/crm/instellingen");
  if (await getBeheerAdmin()) redirect(next);
  const { data } = await db().from("crm_settings").select("beheer_hash").eq("id", 1).single();
  return (
    <>
      <CrmBar user={user} actief="" />
      <BeheerSlot next={next} eersteKeer={!(data as { beheer_hash: string | null }).beheer_hash} />
    </>
  );
}
