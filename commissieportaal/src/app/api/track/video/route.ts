import { after, NextResponse } from "next/server";
import { slaVideoEventOp } from "@/lib/video/server";
import { clientIp, corsHeaders, leesBody, maakRateLimit, MAX_BODY, originToegestaan, videoRow } from "@/lib/video/track";

export const dynamic = "force-dynamic";

// 60 events per minuut per IP is ruim voor een echte bezoeker (view, play, calendly_view, booked).
const binnenLimiet = maakRateLimit(60, 60000);

/** CORS-preflight van de beauty-site. */
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!originToegestaan(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * Event van /video of /video-2 (view, play, calendly_view, booked). Body is JSON, ook als text/plain (sendBeacon).
 * Alleen vanaf de toegestane origins. Geen cookies, geen IP en geen ruwe user agent opgeslagen. Antwoord 204.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!originToegestaan(origin)) return new NextResponse(null, { status: 403 });
  const headers = corsHeaders(origin);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new NextResponse(null, { status: 413, headers });
  if (!binnenLimiet(clientIp(req))) return new NextResponse(null, { status: 429, headers });

  const body = leesBody(await req.text());
  if (!body.ok) return new NextResponse(null, { status: 400, headers });

  const row = videoRow(body.data, req.headers.get("user-agent"));
  const opslaan = () =>
    slaVideoEventOp(row).catch((e) => {
      console.error("Video-event opslaan mislukt", e);
    });
  // Opslaan na het antwoord, zodat de pagina direct 204 krijgt.
  try {
    after(opslaan);
  } catch {
    await opslaan(); // buiten een request-scope (tests)
  }
  return new NextResponse(null, { status: 204, headers });
}
