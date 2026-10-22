import "server-only";
import { db } from "../supabase/server";
import { crmSettings } from "./calendly";
import { UITKOMSTEN, type Uitkomst } from "./core";
import { syncOpvolging } from "./google";
import { twilioStatus } from "./twilio";
import { huidigeCrmId } from "./werkruimte";
import { actor, check, CrmError, getContact, log, OPP_COLS, wijsToe, zetFase, type CrmUser, type Opp } from "./server";

function alleenSetter(user: CrmUser) {
  if (user.rol !== "setter") throw new CrmError("Alleen setters bellen vanuit de belwachtrij.", 403);
  return user.setter;
}

/** Reserveert de eerstvolgende geschikte lead (atomair; nooit twee setters op dezelfde lead). */
export async function volgendeLead(user: CrmUser, overslaan: string[] = []): Promise<string | null> {
  const s = alleenSetter(user);
  const { reservering_min } = await crmSettings();
  const ids = overslaan.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  const r = await db().rpc("crm_reserveer_volgende", { p_setter: s.id, p_minuten: reservering_min, p_overslaan: ids, p_crm: await huidigeCrmId() });
  if (r.error) throw new Error(r.error.message);
  return (r.data as string | null) ?? null;
}

/** Een specifieke lead reserveren (bellen vanaf de leadkaart). */
export async function reserveer(user: CrmUser, contactId: string) {
  const s = alleenSetter(user);
  const { reservering_min } = await crmSettings();
  const r = await db().rpc("crm_reserveer", { p_contact: contactId, p_setter: s.id, p_minuten: reservering_min });
  if (r.error) throw new Error(r.error.message);
  if (!r.data) throw new CrmError("Deze lead wordt al gebeld door een andere setter, is van een andere setter of staat op niet meer benaderen.", 409);
}

export async function geefVrij(user: CrmUser, contactId: string) {
  const s = alleenSetter(user);
  check(await db().from("crm_contacts").update({ gereserveerd_door: null, gereserveerd_tot: null }).eq("id", contactId).eq("gereserveerd_door", s.id));
}

/**
 * Start een belpoging. Controleert reservering en niet-meer-benaderen. Bij een fout vóór de belpoging
 * wordt de reservering vrijgegeven, zodat een andere setter de lead kan bellen.
 */
export async function startOproep(user: CrmUser, contactId: string) {
  const s = alleenSetter(user);
  const c = await getContact(contactId);
  try {
    if (c.niet_benaderen) throw new CrmError("Deze lead staat op niet meer benaderen.");
    if (!c.telefoon_norm) throw new CrmError("Deze lead heeft geen geldig telefoonnummer.");
    if (c.gereserveerd_door !== s.id || !c.gereserveerd_tot || new Date(c.gereserveerd_tot).getTime() < Date.now()) {
      await reserveer(user, contactId);
    }
    const provider = twilioStatus().voice ? "twilio" : "handmatig";
    const call = check(await db().from("crm_calls").insert({ contact_id: c.id, setter_id: s.id, door: user.email, provider }).select("id").single()) as { id: string };
    return { callId: call.id, provider, telefoon: c.telefoon_norm };
  } catch (e) {
    await geefVrij(user, contactId).catch(() => null);
    throw e;
  }
}

export interface UitkomstInput {
  uitkomst: Uitkomst;
  notitie?: string;
  opvolgOp?: string | null;
  duurSec?: number | null;
}

/** Registreert de menselijke uitkomst en verwerkt toewijzing, fase en opvolging. */
export async function registreerUitkomst(user: CrmUser, callId: string, input: UitkomstInput) {
  const s = alleenSetter(user);
  const u = UITKOMSTEN.find((x) => x.key === input.uitkomst);
  if (!u) throw new CrmError("Onbekende uitkomst.");
  const call = check(await db().from("crm_calls").select("id, contact_id, setter_id, uitkomst, gestart_op, duur_sec, provider").eq("id", callId).maybeSingle()) as {
    id: string;
    contact_id: string;
    setter_id: string;
    uitkomst: string | null;
    gestart_op: string;
    duur_sec: number | null;
    provider: string;
  } | null;
  if (!call || call.setter_id !== s.id) throw new CrmError("Onbekende oproep.", 404);
  if (call.uitkomst) throw new CrmError("De uitkomst van deze oproep is al vastgelegd.", 409);
  if (input.uitkomst === "terugbellen" && !input.opvolgOp) throw new CrmError("Kies wanneer je terugbelt.");
  if (input.opvolgOp && Number.isNaN(Date.parse(input.opvolgOp))) throw new CrmError("Ongeldig opvolgmoment.");

  const now = new Date();
  const duur = call.provider === "handmatig" ? (input.duurSec ?? Math.round((now.getTime() - new Date(call.gestart_op).getTime()) / 1000)) : call.duur_sec;
  check(
    await db()
      .from("crm_calls")
      .update({ uitkomst: u.key, notitie: input.notitie?.trim() || null, beeindigd_op: now.toISOString(), duur_sec: duur })
      .eq("id", call.id)
      .is("uitkomst", null),
  );

  const c = await getContact(call.contact_id);
  await wijsToe(c, s.id, user.email);

  // Opvolgmoment: expliciet gekozen, of standaard morgen voor niet opgenomen/WAFU.
  let opvolg: string | null | undefined = input.opvolgOp ? new Date(input.opvolgOp).toISOString() : undefined;
  if (opvolg === undefined && (u.key === "niet_opgenomen" || u.key === "wafu")) opvolg = new Date(now.getTime() + 24 * 3600000).toISOString();
  if (["niet_geinteresseerd", "ongeldig_nummer", "niet_benaderen", "ingepland", "al_klant"].includes(u.key)) opvolg = null;

  check(
    await db()
      .from("crm_contacts")
      .update({
        belpogingen: c.belpogingen + 1,
        laatste_contact_op: now.toISOString(),
        gereserveerd_door: null,
        gereserveerd_tot: null,
        ...(opvolg !== undefined ? { volgende_opvolging_op: opvolg } : {}),
        ...(u.key === "niet_benaderen" ? { niet_benaderen: true, niet_benaderen_reden: "Tijdens gesprek aangegeven" } : {}),
        updated_at: now.toISOString(),
      })
      .eq("id", c.id),
  );
  await syncOpvolging(c.id);
  if (u.key === "niet_benaderen") {
    check(await db().from("crm_consents").insert(["whatsapp", "sms", "email", "bellen"].map((k) => ({ contact_id: c.id, kanaal: k, status: "ingetrokken", bron: "Niet meer benaderen (gesprek)", vastgelegd_door: user.email }))));
  }

  const outbound = check(await db().from("crm_opportunities").select(OPP_COLS).eq("contact_id", c.id).eq("pijplijn", "outbound").maybeSingle()) as Opp | null;
  if (outbound && u.fase && outbound.fase !== "ingepland") await zetFase(outbound, u.fase, user.email, s.id, "Belpoging");
  await log({
    contact_id: c.id,
    ...actor(user),
    type: "oproep",
    tekst: `Belpoging: ${u.label}${duur ? ` (${Math.floor(duur / 60)}:${String(duur % 60).padStart(2, "0")})` : ""}${input.notitie?.trim() ? `\n${input.notitie.trim()}` : ""}`,
  });
  return { wafu: u.key === "niet_opgenomen" || u.key === "wafu", inplannen: u.key === "ingepland" };
}

/** Lead die de setter nu gereserveerd heeft (bij herladen van het belscherm). */
export async function huidigeReservering(user: CrmUser): Promise<string | null> {
  const s = alleenSetter(user);
  const r = check(await db().from("crm_contacts").select("id").eq("gereserveerd_door", s.id).gt("gereserveerd_tot", new Date().toISOString()).limit(1).maybeSingle()) as { id: string } | null;
  return r?.id ?? null;
}

export async function actiefScript() {
  return check(await db().from("crm_scripts").select("*").eq("actief", true).order("updated_at", { ascending: false }).limit(1).maybeSingle()) as {
    id: string;
    naam: string;
    opening: string;
    kwalificatie: string;
    pitch: string;
    bezwaren: { bezwaar: string; antwoord: string }[];
    afsluiting: string;
  } | null;
}

export { zetFase };
