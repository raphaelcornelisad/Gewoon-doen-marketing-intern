import { crmRoute } from "@/lib/crm/api";
import { ontkoppel } from "@/lib/crm/google";
import { CrmError } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute(req, async (user) => {
    if (!user.setter) throw new CrmError("Alleen voor setters.", 403);
    await ontkoppel(user.setter.id);
  });
}
