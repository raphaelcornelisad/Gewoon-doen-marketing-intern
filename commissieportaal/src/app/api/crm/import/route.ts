import { crmRoute } from "@/lib/crm/api";
import { importLeads } from "@/lib/crm/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  return crmRoute<{ url?: string; csv?: string; bestandsnaam?: string; crmId?: string }>(req, async (user, b) => importLeads(user, { url: b.url, csv: b.csv?.slice(0, 15_000_000), bestandsnaam: b.bestandsnaam, crmId: b.crmId }), { beheer: true });
}
