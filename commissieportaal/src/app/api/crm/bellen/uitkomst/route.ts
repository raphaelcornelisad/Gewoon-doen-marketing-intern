import { registreerUitkomst, type UitkomstInput } from "@/lib/crm/bellen";
import { crmRoute } from "@/lib/crm/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<UitkomstInput & { callId?: string }>(req, async (user, b) => registreerUitkomst(user, String(b.callId), b));
}
