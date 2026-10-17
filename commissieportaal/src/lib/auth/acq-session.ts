import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acqSetterByEmail, type AcqSetter } from "../acquisitie/server";
import { env } from "../env";
import { signSession, verifySession } from "./token";

export const ACQ_COOKIE = "gdm_acq";
const DAYS = 30;

export async function getAcqSetter(): Promise<AcqSetter | null> {
  const p = verifySession((await cookies()).get(ACQ_COOKIE)?.value, env("ADMIN_SESSION_SECRET"));
  if (!p) return null;
  return acqSetterByEmail(p.email);
}

export async function requireAcqSetter(): Promise<AcqSetter> {
  const s = await getAcqSetter();
  if (!s) redirect("/acquisitie/login");
  return s;
}

export function acqCookie(email: string) {
  const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
  return {
    name: ACQ_COOKIE,
    value: signSession({ email, exp }, env("ADMIN_SESSION_SECRET")),
    options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: DAYS * 86400 },
  };
}
