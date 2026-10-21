import { ingelogd, leesToken, naarCrm, naarLogin, verifieer } from "@/lib/auth/inloglink";
import { getAdmin, sessionCookie } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/token";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

async function inloggen(req: Request) {
  const tokenHash = await leesToken(req);
  if (!tokenHash) return naarLogin("link");
  const email = await verifieer(tokenHash);
  if (!email || !isAdminEmail(email, env("ADMIN_EMAIL"))) {
    if (await getAdmin()) return naarCrm();
    return naarLogin("verlopen");
  }
  return ingelogd("admin", sessionCookie(email));
}

export const GET = inloggen;
export const POST = inloggen;
