import { crmRoute } from "@/lib/crm/api";
import { importSheet } from "@/lib/crm/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  return crmRoute<{ url?: string }>(req, async (user, b) => importSheet(user, String(b.url ?? "")));
}
