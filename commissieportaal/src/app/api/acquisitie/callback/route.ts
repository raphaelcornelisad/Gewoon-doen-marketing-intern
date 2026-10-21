import { acqSetterByEmail } from "@/lib/acquisitie/server";
import { acqCookie, getAcqSetter } from "@/lib/auth/acq-session";
import { ingelogd, leesToken, naarCrm, naarLogin, verifieer } from "@/lib/auth/inloglink";

export const dynamic = "force-dynamic";

async function inloggen(req: Request) {
  const tokenHash = await leesToken(req);
  if (!tokenHash) return naarLogin("link");
  const email = await verifieer(tokenHash);
  const setter = email ? await acqSetterByEmail(email) : null;
  if (!setter) {
    // Al ingelogd (bijv. de link nog eens aangeklikt)? Dan gewoon door naar het CRM.
    if (await getAcqSetter()) return naarCrm();
    return naarLogin("verlopen");
  }
  return ingelogd("setter", acqCookie(setter.email));
}

export const GET = inloggen;
export const POST = inloggen;
