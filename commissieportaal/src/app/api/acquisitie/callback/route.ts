import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { acqSetterByEmail } from "@/lib/acquisitie/server";
import { acqCookie } from "@/lib/auth/acq-session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tokenHash = new URL(req.url).searchParams.get("token_hash");
  const base = env("APP_URL").replace(/\/$/, "");
  if (!tokenHash) return NextResponse.redirect(`${base}/acquisitie/login?fout=link`);
  const sb = createClient(env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const setter = data.user?.email ? await acqSetterByEmail(data.user.email) : null;
  if (error || !setter) return NextResponse.redirect(`${base}/acquisitie/login?fout=verlopen`);
  const res = NextResponse.redirect(`${base}/crm`);
  const c = acqCookie(setter.email);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
