import { isAdminEmail } from "@/lib/auth/token";
import { env } from "@/lib/env";
import { POST as adminLogin } from "../../admin/login/route";
import { POST as setterLogin } from "../../acquisitie/login/route";

export const dynamic = "force-dynamic";

/** Eén inlogpagina: admin-adres krijgt de admin-link, anders de link voor setters/sales. Zelfde antwoord voor elk adres. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const doorsturen = new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return isAdminEmail(body.email, env("ADMIN_EMAIL")) ? adminLogin(doorsturen) : setterLogin(doorsturen);
}
