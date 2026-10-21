import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "../env";
import { ACQ_COOKIE } from "./acq-session";
import { BEHEER_COOKIE } from "./beheer";
import { SESSION_COOKIE } from "./session";

const basis = () => env("APP_URL").replace(/\/$/, "");

/**
 * Link in de inlogmail: eerst een bevestigingspagina met een knop. Virusscanners en linkvoorbeelden in mailprogramma's
 * openen links automatisch; zonder deze tussenstap verbruiken zij de eenmalige link en is hij "verlopen" voor de gebruiker.
 */
export const bevestigLink = (rol: "admin" | "setter", tokenHash: string) => `${basis()}/crm/login/bevestig?rol=${rol}&token_hash=${encodeURIComponent(tokenHash)}`;

/** Uniek onderwerp per mail, zodat Gmail nieuwe inlogmails niet samenvoegt of als herhaling verbergt. */
export const inlogOnderwerp = () =>
  `Inloggen Gewoon Sales Doen · ${new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;

/** Token uit GET (oude links) of POST (bevestigingsknop). */
export async function leesToken(req: Request): Promise<string | null> {
  if (req.method === "POST") {
    const f = await req.formData().catch(() => null);
    const t = f?.get("token_hash");
    return typeof t === "string" ? t : null;
  }
  return new URL(req.url).searchParams.get("token_hash");
}

export async function verifieer(tokenHash: string): Promise<string | null> {
  const sb = createClient(env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  return error ? null : (data.user?.email ?? null);
}

/** Ingelogd als één persoon tegelijk: de cookies van de andere rol worden gewist. */
export function ingelogd(rol: "admin" | "setter", cookie: { name: string; value: string; options: Record<string, unknown> }) {
  const res = NextResponse.redirect(`${basis()}/crm`, 303);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  for (const naam of rol === "admin" ? [ACQ_COOKIE] : [SESSION_COOKIE, BEHEER_COOKIE]) res.cookies.set(naam, "", { path: "/", maxAge: 0 });
  return res;
}

export const naarLogin = (fout: string) => NextResponse.redirect(`${basis()}/crm/login?fout=${fout}`, 303);
export const naarCrm = () => NextResponse.redirect(`${basis()}/crm`, 303);
