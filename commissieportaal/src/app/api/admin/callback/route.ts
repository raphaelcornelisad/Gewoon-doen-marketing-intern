import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/token";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const base = env("APP_URL").replace(/\/$/, "");
  if (!tokenHash) return NextResponse.redirect(`${base}/admin/login?fout=link`);

  const sb = createClient(env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const email = data.user?.email;
  if (error || !isAdminEmail(email, env("ADMIN_EMAIL"))) {
    return NextResponse.redirect(`${base}/admin/login?fout=verlopen`);
  }

  const res = NextResponse.redirect(`${base}/admin`);
  const c = sessionCookie(email!);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
