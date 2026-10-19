import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "../supabase/server";
import { crmSettings } from "./calendly";
import { check, CrmError, log, type CrmUser } from "./server";
import { haalOpname, twilioStatus, verwijderOpname } from "./twilio";

/**
 * Opnames → transcript (Deepgram, Nederlands) → analyse (Claude).
 * Werkt pas als DEEPGRAM_API_KEY en ANTHROPIC_API_KEY in Vercel staan. Er wordt niets verzonnen:
 * elk bezwaar moet letterlijk in het transcript staan, anders wordt het weggelaten.
 */
export const BEZWAAR_CATEGORIEEN = ["prijs", "timing", "geen_interesse", "bestaande_leverancier", "eerst_informatie", "overig"] as const;

export function analyseStatus() {
  return { transcriptie: !!process.env.DEEPGRAM_API_KEY, analyse: !!process.env.ANTHROPIC_API_KEY };
}

interface Uiting {
  start: number;
  eind: number;
  spreker: string;
  tekst: string;
}

async function transcribeer(opnameUrl: string): Promise<Uiting[]> {
  const audio = await haalOpname(opnameUrl);
  const model = process.env.DEEPGRAM_MODEL || "nova-2";
  const res = await fetch(`https://api.deepgram.com/v1/listen?model=${model}&language=nl&diarize=true&utterances=true&smart_format=true&punctuate=true`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "audio/mpeg" },
    body: Buffer.from(await audio.arrayBuffer()),
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { results?: { utterances?: { start: number; end: number; speaker: number; transcript: string }[] } };
  return (data.results?.utterances ?? []).map((u) => ({ start: Math.round(u.start), eind: Math.round(u.end), spreker: `Spreker ${u.speaker + 1}`, tekst: u.transcript }));
}

const Analyse = z.object({
  samenvatting: z.string().describe("2-4 zinnen, alleen wat in het gesprek is gezegd"),
  vervolgstap: z.string().nullable().describe("De expliciet afgesproken vervolgstap, of null als er geen is afgesproken"),
  bezwaren: z.array(
    z.object({
      categorie: z.enum(BEZWAAR_CATEGORIEEN),
      citaat: z.string().describe("Letterlijk fragment uit het transcript"),
      tijdstip_sec: z.number().int().describe("Starttijd (seconden) van de regel waar het citaat staat"),
    }),
  ),
});

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/** Houdt alleen bezwaren over waarvan het citaat echt in het transcript staat; tijdstip uit het transcript. */
export function controleerBezwaren(bezwaren: z.infer<typeof Analyse>["bezwaren"], transcript: Uiting[]) {
  return bezwaren.flatMap((b) => {
    const c = norm(b.citaat);
    if (c.length < 4) return [];
    const regel = transcript.find((u) => norm(u.tekst).includes(c));
    return regel ? [{ ...b, tijdstip_sec: regel.start }] : [];
  });
}

async function analyseer(transcript: Uiting[]) {
  const client = new Anthropic();
  const tekst = transcript.map((u) => `[${u.start}s] ${u.spreker}: ${u.tekst}`).join("\n");
  const res = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Analyse) },
    system:
      "Je analyseert koude-acquisitiegesprekken van Gewoon Doen Marketing (marketing voor salons en klinieken). " +
      "Gebruik uitsluitend wat in het transcript staat; vul niets aan. Bezwaren: alleen echte bezwaren van de gebelde partij, " +
      "met een letterlijk citaat en de starttijd van die regel. Is iets niet besproken, laat het dan leeg of null.",
    messages: [{ role: "user", content: `Transcript (Nederlands, sprekers automatisch herkend):\n\n${tekst}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`Analyse niet beschikbaar (${res.stop_reason})`);
  return res.parsed_output;
}

/** Verwerkt oproepen in de wachtrij (aangeroepen door de cron). */
export async function verwerkAnalyses(max = 3) {
  const st = analyseStatus();
  if (!st.transcriptie) return { verwerkt: 0 };
  const rows = check(await db().from("crm_calls").select("id, contact_id, opname_url").eq("analyse_status", "wachtrij").not("opname_url", "is", null).order("created_at").limit(max)) as {
    id: string;
    contact_id: string;
    opname_url: string;
  }[];
  let n = 0;
  for (const r of rows) {
    try {
      const transcript = await transcribeer(r.opname_url);
      const upd: Record<string, unknown> = { transcript, analyse_status: st.analyse ? "wachtrij" : "klaar" };
      if (st.analyse && transcript.length) {
        const a = await analyseer(transcript);
        Object.assign(upd, { samenvatting: a.samenvatting, vervolgstap: a.vervolgstap, bezwaren: controleerBezwaren(a.bezwaren, transcript), analyse_status: "klaar" });
      } else if (!transcript.length) upd.analyse_status = "klaar";
      check(await db().from("crm_calls").update(upd).eq("id", r.id));
      await log({ contact_id: r.contact_id, door: "systeem", type: "oproep", tekst: "Gesprek getranscribeerd en geanalyseerd" });
      n++;
    } catch (e) {
      console.error("Analyse mislukt", r.id, e);
      check(await db().from("crm_calls").update({ analyse_status: "mislukt" }).eq("id", r.id));
    }
  }
  return { verwerkt: n };
}

/** Gebruiker corrigeert de analyse (samenvatting, vervolgstap, bezwaren). */
export async function corrigeerAnalyse(user: CrmUser, callId: string, input: { samenvatting?: string; vervolgstap?: string | null; bezwaren?: { categorie: string; citaat: string; tijdstip_sec: number }[] }) {
  const c = check(await db().from("crm_calls").select("id, contact_id, setter_id").eq("id", callId).maybeSingle()) as { id: string; contact_id: string; setter_id: string | null } | null;
  if (!c) throw new CrmError("Onbekende oproep.", 404);
  if (user.rol !== "admin" && c.setter_id !== user.setter?.id) throw new CrmError("Geen toegang.", 403);
  const bezwaren = input.bezwaren?.filter((b) => (BEZWAAR_CATEGORIEEN as readonly string[]).includes(b.categorie) && b.citaat.trim());
  check(
    await db()
      .from("crm_calls")
      .update({
        ...(input.samenvatting !== undefined ? { samenvatting: input.samenvatting.trim() || null } : {}),
        ...(input.vervolgstap !== undefined ? { vervolgstap: input.vervolgstap?.trim() || null } : {}),
        ...(bezwaren ? { bezwaren } : {}),
        analyse_status: "gecorrigeerd",
        analyse_gecorrigeerd_door: user.email,
      })
      .eq("id", c.id),
  );
  await log({ contact_id: c.contact_id, door: user.email, setter_id: user.setter?.id ?? null, type: "oproep", tekst: "Gespreksanalyse gecorrigeerd" });
}

/** Opnames en transcripten ouder dan de bewaartermijn verwijderen (Twilio + database). */
export async function ruimOpnamesOp() {
  const { bewaartermijn_dagen } = await crmSettings();
  const grens = new Date(Date.now() - bewaartermijn_dagen * 86400000).toISOString();
  const rows = check(await db().from("crm_calls").select("id, opname_sid").not("opname_sid", "is", null).lt("gestart_op", grens).limit(100)) as { id: string; opname_sid: string }[];
  for (const r of rows) {
    if (twilioStatus().basis) await verwijderOpname(r.opname_sid).catch((e) => console.error("Opname verwijderen", r.id, e));
    check(await db().from("crm_calls").update({ opname_sid: null, opname_url: null, transcript: null }).eq("id", r.id));
  }
  return { verwijderd: rows.length };
}

/** Bezwarenoverzicht voor de admin (per setter, categorie en maand). */
export async function bezwarenOverzicht(vanaf: string) {
  const rows = check(await db().from("crm_calls").select("setter_id, gestart_op, bezwaren").not("bezwaren", "is", null).gte("gestart_op", vanaf).limit(5000)) as {
    setter_id: string | null;
    gestart_op: string;
    bezwaren: { categorie: string }[];
  }[];
  const tel: Record<string, Record<string, number>> = {};
  for (const r of rows) for (const b of r.bezwaren ?? []) {
    const k = r.setter_id ?? "onbekend";
    (tel[k] ??= {})[b.categorie] = (tel[k][b.categorie] ?? 0) + 1;
  }
  return { gesprekken: rows.length, perSetter: tel };
}
