import "server-only";
import { createHash } from "node:crypto";
import { check } from "../crm/server";
import { db } from "../supabase/server";
import { igSyncSchema } from "./schema";
import { leesWebhook, SCRIPT_FASES, scriptFase, voorlopigGesprekId, type FaseBericht, type MetaWebhook, type WebhookBericht } from "./webhook";

const GRAPH = "https://graph.instagram.com/v26.0";

/** Eigen IG-account-id: env IG_OWN_ID, anders het enige account in ig_accounts, anders null (dan geldt entry.id). */
export async function eigenIgId(): Promise<string | null> {
  if (process.env.IG_OWN_ID) return process.env.IG_OWN_ID;
  const rows = (check(await db().from("ig_accounts").select("ig_user_id").limit(2)) ?? []) as { ig_user_id: string }[];
  return rows.length === 1 ? rows[0].ig_user_id : null;
}

/**
 * Gebruikersnaam bij een Instagram-scoped id, met één Graph-call. Faalt zacht: bij elke fout null.
 * Alleen lezen; er wordt niets verstuurd of gemarkeerd.
 */
export async function haalGebruikersnaam(igsid: string, token = process.env.IG_ACCESS_TOKEN, f: typeof fetch = fetch): Promise<string | null> {
  if (!token || !/^[0-9A-Za-z_-]{1,64}$/.test(igsid)) return null;
  try {
    const url = `${GRAPH}/${encodeURIComponent(igsid)}?fields=username&access_token=${encodeURIComponent(token)}`;
    const r = await f(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { username?: unknown };
    return typeof j.username === "string" && /^[A-Za-z0-9._]{1,30}$/.test(j.username) ? j.username : null;
  } catch {
    return null;
  }
}

interface BestaandGesprek {
  id: string;
  ig_conversation_id: string;
  fase: string;
  fase_bron: string;
  lead_gebruikersnaam: string | null;
}

export interface WebhookResultaat {
  status: "verwerkt" | "dubbel" | "genegeerd";
  berichten: number;
  /** Nabewerking na het antwoord aan Meta (gebruikersnamen opzoeken). */
  nabewerking: () => Promise<void>;
}

const niets = async () => {};

/**
 * Verwerkt één webhooklevering (handtekening is al gecontroleerd).
 * Zet de berichten om naar het ig_sync-formaat en roept dezelfde database-functie aan als de sync: idempotent op ig_message_id.
 * Een handmatige fase blijft staan (ig_sync), en een fase van het brein wordt niet door de webhook teruggezet.
 */
export async function verwerkWebhook(raw: string, body: MetaWebhook): Promise<WebhookResultaat> {
  const eventId = createHash("sha256").update(raw, "utf8").digest("hex");
  const ins = await db().from("ig_webhook_events").insert({ event_id: eventId }).select("id").single();
  if (ins.error) {
    if (!/duplicate key|unique/i.test(ins.error.message)) throw new Error(ins.error.message);
    const oud = check(await db().from("ig_webhook_events").select("status").eq("event_id", eventId).maybeSingle()) as { status: string } | null;
    // Al verwerkt of genegeerd: niets meer doen. Mislukt of nog bezig: opnieuw (de upsert is idempotent).
    if (oud && (oud.status === "verwerkt" || oud.status === "genegeerd")) return { status: "dubbel", berichten: 0, nabewerking: niets };
  }
  const zet = async (v: Record<string, unknown>) => {
    await db().from("ig_webhook_events").update(v).eq("event_id", eventId);
  };

  try {
    const berichten = leesWebhook(body, await eigenIgId());
    if (!berichten.length) {
      await zet({ status: "genegeerd", berichten: 0, verwerkt_op: new Date().toISOString() });
      return { status: "genegeerd", berichten: 0, nabewerking: niets };
    }
    const opzoeken: { id: string; lead: string }[] = [];
    // Per eigen account één ig_sync-payload; per lead één gesprek.
    const perAccount = new Map<string, Map<string, WebhookBericht[]>>();
    for (const b of berichten) {
      const leads = perAccount.get(b.account_ig_id) ?? new Map<string, WebhookBericht[]>();
      leads.set(b.lead_ig_id, [...(leads.get(b.lead_ig_id) ?? []), b]);
      perAccount.set(b.account_ig_id, leads);
    }
    for (const [accountIgId, leads] of perAccount) {
      const acc = check(await db().from("ig_accounts").select("id").eq("ig_user_id", accountIgId).maybeSingle()) as { id: string } | null;
      const threads = [];
      for (const [lead, items] of leads) {
        const bestaand = acc
          ? ((check(
              await db()
                .from("ig_threads")
                .select("id, ig_conversation_id, fase, fase_bron, lead_gebruikersnaam")
                .eq("account_id", acc.id)
                .eq("lead_ig_id", lead)
                .order("laatste_bericht_op", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle(),
            ) as BestaandGesprek | null))
          : null;
        const oud = bestaand
          ? ((check(
              await db().from("ig_messages").select("ig_message_id, van, verzonden_op, tekst, is_bookinglink, is_autoreply, autoreply_bevestigd").eq("thread_id", bestaand.id),
            ) ?? []) as (FaseBericht & { ig_message_id: string })[])
          : [];
        const nieuw = items.map((i) => i.bericht);
        const ids = new Set(nieuw.map((m) => m.ig_message_id));
        const { fase, bookinglinkOp } = scriptFase([...oud.filter((m) => !ids.has(m.ig_message_id)), ...nieuw]);
        // Fase alleen meesturen als het gesprek nieuw is of nog een scriptfase heeft. Brein en handmatig blijven staan.
        const magFase = !bestaand || (bestaand.fase_bron === "script" && (SCRIPT_FASES as string[]).includes(bestaand.fase));
        const eerste = [...nieuw].sort((a, b) => a.verzonden_op.localeCompare(b.verzonden_op))[0];
        threads.push({
          ig_conversation_id: bestaand?.ig_conversation_id ?? voorlopigGesprekId(lead),
          lead_ig_id: lead,
          ...(bestaand ? {} : { gestart_door: eerste.van }),
          ...(fase && magFase && fase !== bestaand?.fase ? { fase, fase_bron: "script" as const } : {}),
          ...(bookinglinkOp ? { bookinglink_op: bookinglinkOp } : {}),
          messages: nieuw,
        });
        if (!bestaand?.lead_gebruikersnaam) opzoeken.push({ id: bestaand?.ig_conversation_id ?? voorlopigGesprekId(lead), lead });
      }
      const p = igSyncSchema.parse({ account: { ig_user_id: accountIgId }, threads });
      const r = await db().rpc("ig_sync", { p });
      if (r.error) throw new Error(r.error.message);
    }
    await zet({ status: "verwerkt", berichten: berichten.length, fout: null, verwerkt_op: new Date().toISOString() });
    return {
      status: "verwerkt",
      berichten: berichten.length,
      nabewerking: async () => {
        for (const o of opzoeken) {
          const naam = await haalGebruikersnaam(o.lead);
          if (!naam) continue; // id blijft staan; de sync vult de naam later aan
          await db().from("ig_threads").update({ lead_gebruikersnaam: naam, updated_at: new Date().toISOString() }).eq("ig_conversation_id", o.id).eq("lead_ig_id", o.lead).is("lead_gebruikersnaam", null);
        }
      },
    };
  } catch (e) {
    await zet({ status: "mislukt", fout: (e instanceof Error ? e.message : String(e)).slice(0, 1000) });
    throw e;
  }
}
