import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "../env";
import { isAdminEmail, signSession, verifySession } from "./token";

export const SESSION_COOKIE = "gdm_admin";
const SESSION_DAYS = 7;

export async function getAdmin(): Promise<{ email: string } | null> {
  const store = await cookies();
  const p = verifySession(store.get(SESSION_COOKIE)?.value, env("ADMIN_SESSION_SECRET"));
  if (!p || !isAdminEmail(p.email, env("ADMIN_EMAIL"))) return null;
  return { email: p.email };
}

/** Gebruik bovenaan elke admin-pagina en admin-route. */
export async function requireAdmin(): Promise<{ email: string }> {
  const admin = await getAdmin();
  if (!admin) redirect("/crm/login");
  return admin;
}

export function sessionCookie(email: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return {
    name: SESSION_COOKIE,
    value: signSession({ email, exp }, env("ADMIN_SESSION_SECRET")),
    options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86400 },
  };
}
