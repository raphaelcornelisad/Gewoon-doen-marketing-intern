import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "../env";
import { getAdmin } from "./session";
import { signSession, verifySession } from "./token";

export const BEHEER_COOKIE = "gdm_beheer";
export const BEHEER_UREN = 8;
const secret = () => `${env("ADMIN_SESSION_SECRET")}:beheer`;

/** Admin die Beheer met het beheerwachtwoord heeft ontgrendeld (8 uur). */
export async function getBeheerAdmin(): Promise<{ email: string } | null> {
  const admin = await getAdmin();
  if (!admin) return null;
  const p = verifySession((await cookies()).get(BEHEER_COOKIE)?.value, secret());
  return p && p.email === admin.email ? admin : null;
}

/** Bovenaan elke beheerpagina: niet-admin → CRM; admin zonder ontgrendeling → wachtwoordvenster. */
export async function requireBeheer(terug: string): Promise<{ email: string }> {
  const admin = await getAdmin();
  if (!admin) redirect("/crm");
  const ok = await getBeheerAdmin();
  if (!ok) redirect(`/crm/beheer?next=${encodeURIComponent(terug)}`);
  return ok;
}

export function beheerCookie(email: string) {
  const exp = Math.floor(Date.now() / 1000) + BEHEER_UREN * 3600;
  return { name: BEHEER_COOKIE, value: signSession({ email, exp }, secret()), options: { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: BEHEER_UREN * 3600 } };
}
