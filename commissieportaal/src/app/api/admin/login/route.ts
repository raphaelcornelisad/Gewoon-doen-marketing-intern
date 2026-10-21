import { NextResponse } from "next/server";
import { brand } from "@/config/brand";
import { isAdminEmail } from "@/lib/auth/token";
import { bevestigLink, inlogOnderwerp } from "@/lib/auth/inloglink";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/resend";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OK = { ok: true, message: "Als dit adres toegang heeft, staat er een inloglink in je mailbox." };

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  // Altijd hetzelfde antwoord, zodat niet te achterhalen is welk adres admin is.
  if (!isAdminEmail(email, env("ADMIN_EMAIL"))) return NextResponse.json(OK);

  const adminEmail = env("ADMIN_EMAIL").toLowerCase();
  try {
    const sb = db();
    await sb.auth.admin.createUser({ email: adminEmail, email_confirm: true }).catch(() => null);
    const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: adminEmail });
    if (error || !data.properties?.hashed_token) throw error ?? new Error("Geen token");

    const link = bevestigLink("admin", data.properties.hashed_token);
    await sendMail({
      to: adminEmail,
      subject: inlogOnderwerp(),
      text: `Klik op deze link om in te loggen (1 uur geldig, aangevraagd ${inlogOnderwerp().split(" · ")[1]}):\n${link}\n\nNiet aangevraagd? Dan kun je deze mail negeren.`,
      html: `<p>Klik op de knop om in te loggen in het Gewoon Sales Doen. De link is 1 uur geldig (aangevraagd ${inlogOnderwerp().split(" · ")[1]}). Gebruik altijd de nieuwste mail.</p>
<p><a href="${link}" style="display:inline-block;background:${brand.kleuren.primair};color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px">Inloggen</a></p>
<p style="color:#5C5C5C;font-size:13px">Niet aangevraagd? Dan kun je deze mail negeren.</p>`,
    });
  } catch (e) {
    console.error("Inloglink niet verstuurd", e);
    return NextResponse.json({ ok: false, message: "De inloglink kon niet worden verstuurd. Probeer het opnieuw." }, { status: 500 });
  }
  return NextResponse.json(OK);
}
