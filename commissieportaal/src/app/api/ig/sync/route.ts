import { NextResponse } from "next/server";
import { igSyncGeautoriseerd } from "@/lib/ig/auth";
import { igSyncSchema } from "@/lib/ig/schema";
import { igSync } from "@/lib/ig/server";

export const dynamic = "force-dynamic";

/**
 * Sync vanaf de box: gesprekken, berichten en dagcijfers van Instagram.
 * Idempotent (upserts op ig_conversation_id en ig_message_id); een handmatig gezette fase blijft staan.
 */
export async function POST(req: Request) {
  if (!igSyncGeautoriseerd(req.headers.get("authorization"), process.env.IG_SYNC_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = igSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Ongeldige payload.", fouten: parsed.error.issues.slice(0, 20).map((i) => ({ pad: i.path.join("."), melding: i.message })) },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ ok: true, ...(await igSync(parsed.data)) });
  } catch (e) {
    console.error("Instagram-sync mislukt", e);
    return NextResponse.json({ ok: false, message: "Opslaan mislukt." }, { status: 500 });
  }
}
