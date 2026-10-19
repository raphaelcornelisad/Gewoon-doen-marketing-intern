import "server-only";
import { db } from "../supabase/server";
import { abonneerWebhook } from "./calendly";
import { check, CrmError, type CrmUser } from "./server";

function alleenAdmin(u: CrmUser) {
  if (u.rol !== "admin") throw new CrmError("Alleen de admin.", 403);
}

const VELDEN = ["auto_doorbellen", "aftel_sec", "reservering_min", "calendly_url_kennismaking", "calendly_url_sales", "calendly_event_kennismaking", "calendly_event_sales", "utm_campaign", "opnemen", "opname_melding", "bewaartermijn_dagen"] as const;

export async function slaInstellingenOp(user: CrmUser, input: Record<string, unknown>) {
  alleenAdmin(user);
  const upd: Record<string, unknown> = {};
  for (const k of VELDEN) {
    if (!(k in input)) continue;
    const v = input[k];
    if (k === "auto_doorbellen" || k === "opnemen") upd[k] = !!v;
    else if (k === "aftel_sec" || k === "reservering_min" || k === "bewaartermijn_dagen") {
      const n = Number(v);
      const [min, max] = k === "aftel_sec" ? [0, 60] : k === "reservering_min" ? [2, 120] : [1, 3650];
      if (!Number.isInteger(n) || n < min || n > max) throw new CrmError(`${k}: kies een waarde tussen ${min} en ${max}.`);
      upd[k] = n;
    } else if (k === "calendly_url_kennismaking" || k === "calendly_url_sales") {
      const s = String(v ?? "").trim();
      if (s && !/^https:\/\/calendly\.com\/[\w.-]+\/[\w.-]+\/?$/.test(s)) throw new CrmError("Gebruik een Calendly-link zoals https://calendly.com/naam/kennismaking.");
      upd[k] = s || null;
    } else {
      const s = String(v ?? "").trim();
      if (!s) throw new CrmError(`${k} mag niet leeg zijn.`);
      upd[k] = s.slice(0, 500);
    }
  }
  check(await db().from("crm_settings").update(upd).eq("id", 1));
}

export async function webhookAanzetten(user: CrmUser) {
  alleenAdmin(user);
  return abonneerWebhook();
}

export async function slaScriptOp(user: CrmUser, s: { id?: string; naam: string; campagne?: string; opening: string; kwalificatie: string; pitch: string; bezwaren: { bezwaar: string; antwoord: string }[]; afsluiting: string; actief: boolean }) {
  alleenAdmin(user);
  if (!s.naam?.trim()) throw new CrmError("Geef het script een naam.");
  const rij = {
    naam: s.naam.trim(),
    campagne: s.campagne?.trim() || null,
    opening: s.opening ?? "",
    kwalificatie: s.kwalificatie ?? "",
    pitch: s.pitch ?? "",
    bezwaren: (s.bezwaren ?? []).filter((b) => b.bezwaar?.trim()).map((b) => ({ bezwaar: b.bezwaar.trim(), antwoord: (b.antwoord ?? "").trim() })),
    afsluiting: s.afsluiting ?? "",
    actief: !!s.actief,
    updated_at: new Date().toISOString(),
  };
  if (s.id) check(await db().from("crm_scripts").update(rij).eq("id", s.id));
  else check(await db().from("crm_scripts").insert(rij));
}

export async function slaTemplateOp(user: CrmUser, t: { id?: string; naam: string; kanaal: string; doel: string; tekst: string; provider_template_id?: string; categorie: string; actief: boolean }) {
  alleenAdmin(user);
  if (!t.naam?.trim() || !t.tekst?.trim()) throw new CrmError("Naam en tekst zijn verplicht.");
  const rij = {
    naam: t.naam.trim(),
    kanaal: t.kanaal === "sms" ? "sms" : "whatsapp",
    doel: ["wafu", "bevestiging", "herinnering", "algemeen"].includes(t.doel) ? t.doel : "algemeen",
    tekst: t.tekst.trim(),
    provider_template_id: t.provider_template_id?.trim() || null,
    categorie: t.categorie === "utility" ? "utility" : "marketing",
    actief: !!t.actief,
  };
  if (t.id) check(await db().from("crm_templates").update(rij).eq("id", t.id));
  else check(await db().from("crm_templates").insert(rij));
}

export async function slaGebruikerOp(user: CrmUser, g: { id?: string; naam: string; email: string; rol: string; start_datum: string; actief: boolean; utm_source?: string }) {
  alleenAdmin(user);
  const email = g.email?.trim().toLowerCase();
  if (!g.naam?.trim() || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CrmError("Naam en geldig e-mailadres zijn verplicht.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.start_datum)) throw new CrmError("Ongeldige startdatum.");
  const rij = { naam: g.naam.trim(), email, rol: g.rol === "sales" ? "sales" : "setter", start_datum: g.start_datum, actief: !!g.actief, utm_source: g.utm_source?.trim().toLowerCase() || null };
  const r = g.id ? await db().from("acq_setters").update(rij).eq("id", g.id) : await db().from("acq_setters").insert(rij);
  if (r.error) throw new CrmError(/duplicate/.test(r.error.message) ? "Dit e-mailadres of deze UTM-code bestaat al." : r.error.message);
}

export async function instellingenData() {
  const [scripts, tpls, gebruikers, mislukt] = await Promise.all([
    db().from("crm_scripts").select("*").order("updated_at", { ascending: false }),
    db().from("crm_templates").select("*").order("naam"),
    db().from("acq_setters").select("*").order("naam"),
    db().from("crm_webhook_events").select("id, bron, soort, fout, pogingen, created_at").eq("status", "mislukt").order("created_at", { ascending: false }).limit(50),
  ]);
  return { scripts: check(scripts) ?? [], templates: check(tpls) ?? [], gebruikers: check(gebruikers) ?? [], mislukt: check(mislukt) ?? [] };
}
