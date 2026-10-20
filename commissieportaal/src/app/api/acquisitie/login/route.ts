import { NextResponse } from "next/server";
import { brand } from "@/config/brand";
import { acqSetterByEmail } from "@/lib/acquisitie/server";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/resend";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const OK = { ok: true, message: "Als dit adres toegang heeft, staat er een inloglink in je mailbox." };

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const setter = typeof email === "string" ? await acqSetterByEmail(email) : null;
  if (!setter) return NextResponse.json(OK);
  try {
    const sb = db();
    await sb.auth.admin.createUser({ email: setter.email, email_confirm: true }).catch(() => null);
    const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: setter.email });
    if (error || !data.properties?.hashed_token) throw error ?? new Error("Geen token");
    const link = `${env("APP_URL").replace(/\/$/, "")}/api/acquisitie/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
    await sendMail({
      to: setter.email,
      subject: `Inloggen Gewoon Sales Doen`,
      text: `Hoi ${setter.naam},\n\nKlik op deze link om in te loggen (1 uur geldig):\n${link}`,
      html: `<p>Hoi ${setter.naam},</p><p>Klik op de knop om in te loggen. De link is 1 uur geldig.</p><p><a href="${link}" style="display:inline-block;background:${brand.kleuren.primair};color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px">Inloggen</a></p>`,
    });
  } catch (e) {
    console.error("Inloglink acquisitie niet verstuurd", e);
    return NextResponse.json({ ok: false, message: "De inloglink kon niet worden verstuurd. Probeer het opnieuw." }, { status: 500 });
  }
  return NextResponse.json(OK);
}
