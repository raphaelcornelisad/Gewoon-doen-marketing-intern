import "server-only";
import { brand } from "@/config/brand";
import { env } from "../env";

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Verstuurt een e-mail via Resend. Gooit een fout als Resend weigert. */
export async function sendMail(mail: Mail): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env("MAIL_FROM"),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Antwoorden komen altijd in een echte mailbox terecht.
      reply_to: mail.replyTo ?? brand.contactEmail,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${data?.message ?? "onbekende fout"}`);
  return { id: data.id };
}
