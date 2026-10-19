import { getCrmUser } from "@/lib/crm/server";
import { haalOpname } from "@/lib/crm/twilio";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Opname afspelen: alleen admin of de setter van de oproep. Audio komt via de server (Twilio vereist authenticatie). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return new Response("Niet ingelogd.", { status: 401 });
  const { id } = await params;
  const { data } = await db().from("crm_calls").select("setter_id, opname_url, contact_id").eq("id", id).maybeSingle();
  const c = data as { setter_id: string | null; opname_url: string | null; contact_id: string } | null;
  if (!c?.opname_url) return new Response("Geen opname.", { status: 404 });
  if (user.rol !== "admin" && c.setter_id !== user.setter?.id) return new Response("Geen toegang.", { status: 403 });
  await db().from("crm_activities").insert({ contact_id: c.contact_id, door: user.email, setter_id: user.setter?.id ?? null, type: "oproep", tekst: "Opname beluisterd" });
  const audio = await haalOpname(c.opname_url);
  return new Response(audio.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } });
}
