import { z } from "zod";
import { FASE_KEYS } from "./core";

// ---------- Sync-payload (POST /api/ig/sync) ----------

const tijd = z.iso.datetime({ offset: true });
const tel = z.number().int().min(0).nullable().optional();

export const igBerichtSchema = z.object({
  ig_message_id: z.string().min(1).max(200),
  van: z.enum(["wij", "lead"]),
  verzonden_op: tijd,
  tekst: z.string().max(20000).nullable().optional(),
  extra: z.array(z.string().max(2000)).max(50).optional(),
  links: z.array(z.string().max(2000)).max(50).optional(),
  is_bookinglink: z.boolean().optional(),
  is_autoreply: z.boolean().optional(),
  autoreply_bevestigd: z.boolean().nullable().optional(),
});

export const igGesprekSchema = z.object({
  ig_conversation_id: z.string().min(1).max(200),
  lead_ig_id: z.string().max(100).nullable().optional(),
  lead_gebruikersnaam: z.string().max(100).nullable().optional(),
  gestart_door: z.enum(["wij", "lead", "onbekend"]).optional(),
  intern: z.boolean().optional(),
  is_spam: z.boolean().optional(),
  bestaande_klant: z.boolean().optional(),
  fase: z.enum(FASE_KEYS).optional(),
  // 'handmatig' is voorbehouden aan het dashboard.
  fase_bron: z.enum(["script", "brein"]).optional(),
  bookinglink_op: tijd.nullable().optional(),
  geboekt_op: tijd.nullable().optional(),
  calendly_invitee_uri: z.string().max(500).nullable().optional(),
  messages: z.array(igBerichtSchema).max(2000).default([]),
});

export const igDagSchema = z.object({
  rapportdag: z.iso.date(),
  venster_start: tijd.nullable().optional(),
  venster_eind: tijd.nullable().optional(),
  nieuwe_gesprekken: tel,
  nieuw_door_ons: tel,
  nieuw_door_lead: tel,
  lopende_gesprekken: tel,
  echte_reactie_lead: tel,
  alleen_autoreply: tel,
  geen_reactie: tel,
  reactie_openers_pct: z.number().min(0).max(100).nullable().optional(),
  signaal_sterk: tel,
  signaal_lauw: tel,
  geen_interesse: tel,
  bookinglinks: tel,
  calls_bevestigd: tel,
  te_laat_30min: tel,
  wacht_nu_op_ons: tel,
  calendly_nieuw_alle_bronnen: tel,
  berichten_van_ons: tel,
  berichten_van_leads: tel,
  bron: z.record(z.string(), z.enum(["script", "brein"])).optional(),
});

export const igSyncSchema = z.object({
  account: z.object({ ig_user_id: z.string().min(1).max(100), gebruikersnaam: z.string().max(100).nullable().optional() }),
  threads: z.array(igGesprekSchema).max(500).default([]),
  metrics: z.array(igDagSchema).max(60).default([]),
});

export type IgSyncPayload = z.infer<typeof igSyncSchema>;
