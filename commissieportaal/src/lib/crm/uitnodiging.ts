import "server-only";
import { brand } from "@/config/brand";
import { env } from "../env";
import { sendMail } from "../mail/resend";
import { db } from "../supabase/server";
import { check, CrmError } from "./server";

/** Stuurt een gebruiker een uitnodiging met de link naar de inlogpagina. */
export async function stuurUitnodiging(id: string) {
  const g = check(await db().from("acq_setters").select("id, naam, email, rol, actief").eq("id", id).maybeSingle()) as { id: string; naam: string; email: string; rol: string; actief: boolean } | null;
  if (!g) throw new CrmError("Onbekende gebruiker.", 404);
  if (!g.actief) throw new CrmError("Zet de gebruiker eerst op actief.");
  const login = `${env("APP_URL").replace(/\/$/, "")}/crm/login`;
  const voornaam = g.naam.split(" ")[0];
  const rol = g.rol === "sales" ? "salesmedewerker" : "setter";
  await sendMail({
    to: g.email,
    subject: "Je bent uitgenodigd voor Gewoon Sales Doen",
    text: `Hoi ${voornaam},\n\nJe hebt een account als ${rol} in Gewoon Sales Doen, het CRM van Gewoon Doen Marketing.\n\nInloggen: ga naar ${login}, vul dit e-mailadres in (${g.email}) en klik op de inloglink die je daarna in je mailbox krijgt. Je hebt geen wachtwoord nodig.\n\nTip: open de link op je telefoon in Safari en kies Deel → Zet op beginscherm, dan heb je het CRM als app.\n\nGroet,\nGewoon Doen Marketing`,
    html: `<p>Hoi ${voornaam},</p><p>Je hebt een account als <strong>${rol}</strong> in Gewoon Sales Doen, het CRM van Gewoon Doen Marketing.</p><p>Ga naar de inlogpagina, vul dit e-mailadres in (<strong>${g.email}</strong>) en klik op de inloglink die je daarna in je mailbox krijgt. Je hebt geen wachtwoord nodig.</p><p><a href="${login}" style="display:inline-block;background:${brand.kleuren.primair};color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px">Naar inloggen</a></p><p style="color:#666;font-size:13px">Tip: open de link op je telefoon in Safari en kies Deel → Zet op beginscherm, dan heb je het CRM als app.</p><p>Groet,<br>Gewoon Doen Marketing</p>`,
  });
  check(await db().from("acq_setters").update({ uitnodigen: false, uitgenodigd_op: new Date().toISOString() }).eq("id", g.id));
}

/** Wachtrij (cron): gebruikers met uitnodigen = true krijgen hun uitnodiging. */
export async function verwerkUitnodigingen() {
  const rijen = (check(await db().from("acq_setters").select("id").eq("uitnodigen", true).eq("actief", true).limit(20)) ?? []) as { id: string }[];
  let n = 0;
  for (const r of rijen) {
    try {
      await stuurUitnodiging(r.id);
      n++;
    } catch (e) {
      console.error("Uitnodiging niet verstuurd", r.id, e);
    }
  }
  return n;
}
