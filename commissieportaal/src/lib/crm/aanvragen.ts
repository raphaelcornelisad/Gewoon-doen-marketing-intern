import "server-only";
import { brand } from "@/config/brand";
import { env } from "../env";
import { sendMail } from "../mail/resend";
import { db } from "../supabase/server";
import { check, CrmError, type CrmUser } from "./server";

export interface Aanvraag {
  id: string;
  naam: string;
  email: string;
  telefoon: string | null;
  rol: "setter" | "sales";
  toelichting: string | null;
  status: "open" | "goedgekeurd" | "afgewezen";
  beoordeeld_door: string | null;
  beoordeeld_op: string | null;
  created_at: string;
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Openbaar: account aanvragen. Altijd hetzelfde antwoord, zodat niemand kan zien welke adressen bestaan. */
export async function vraagAan(input: Record<string, unknown>, ip: string | null) {
  if (input.website) return; // spam-val
  const naam = s(input.naam, 80);
  const email = s(input.email, 160).toLowerCase();
  if (naam.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CrmError("Vul je naam en een geldig e-mailadres in.");
  const bestaand = check(await db().from("acq_setters").select("id, actief").eq("email", email).maybeSingle()) as { id: string; actief: boolean } | null;
  if (bestaand?.actief) return; // heeft al een account: gewoon inloggen
  // Rem op misbruik: hooguit 50 open aanvragen tegelijk.
  const { count } = await db().from("crm_accountaanvragen").select("id", { count: "exact", head: true }).eq("status", "open");
  if ((count ?? 0) >= 50) return;
  const { error } = await db().from("crm_accountaanvragen").insert({
    naam,
    email,
    telefoon: s(input.telefoon, 40) || null,
    rol: input.rol === "sales" ? "sales" : "setter",
    toelichting: s(input.toelichting, 500) || null,
    ip,
  });
  if (error && !/duplicate/.test(error.message)) throw new Error(error.message);
}

export async function openAanvragen(): Promise<number> {
  const { count } = await db().from("crm_accountaanvragen").select("id", { count: "exact", head: true }).eq("status", "open");
  return count ?? 0;
}

export async function aanvragen(): Promise<Aanvraag[]> {
  return (check(await db().from("crm_accountaanvragen").select("*").order("created_at", { ascending: false }).limit(200)) ?? []) as Aanvraag[];
}

/** Admin keurt goed (gebruiker wordt aangemaakt of geactiveerd) of wijst af. */
export async function beoordeel(user: CrmUser, id: string, goed: boolean, rol?: string) {
  if (user.rol !== "admin") throw new CrmError("Alleen de admin beoordeelt aanvragen.", 403);
  const a = check(await db().from("crm_accountaanvragen").select("*").eq("id", id).maybeSingle()) as Aanvraag | null;
  if (!a || a.status !== "open") throw new CrmError("Deze aanvraag is al beoordeeld.", 409);
  if (goed) {
    const r = rol === "sales" ? "sales" : rol === "setter" ? "setter" : a.rol;
    const bestaand = check(await db().from("acq_setters").select("id").eq("email", a.email).maybeSingle()) as { id: string } | null;
    const rij = { naam: a.naam, email: a.email, rol: r, actief: true, start_datum: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }) };
    check(bestaand ? await db().from("acq_setters").update({ actief: true, rol: r }).eq("id", bestaand.id) : await db().from("acq_setters").insert(rij));
  }
  check(await db().from("crm_accountaanvragen").update({ status: goed ? "goedgekeurd" : "afgewezen", beoordeeld_door: user.email, beoordeeld_op: new Date().toISOString() }).eq("id", a.id).eq("status", "open"));
  if (goed) {
    const login = `${env("APP_URL").replace(/\/$/, "")}/crm/login`;
    await sendMail({
      to: a.email,
      subject: "Je account voor Gewoon Sales Doen is goedgekeurd",
      text: `Hoi ${a.naam},\n\nJe account is goedgekeurd. Log in via ${login} met dit e-mailadres; je krijgt dan een inloglink.`,
      html: `<p>Hoi ${a.naam},</p><p>Je account is goedgekeurd. Log in met dit e-mailadres; je krijgt dan een inloglink in je mailbox.</p><p><a href="${login}" style="display:inline-block;background:${brand.kleuren.primair};color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px">Naar inloggen</a></p>`,
    }).catch((e) => console.error("Goedkeuringsmail niet verstuurd", e));
  }
}
