import { timingSafeEqual } from "node:crypto";

/** Constante-tijd vergelijking van de Authorization-header met `Bearer <IG_SYNC_SECRET>`. Zonder geheim: altijd nee. */
export function igSyncGeautoriseerd(header: string | null, geheim: string | undefined): boolean {
  if (!geheim || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${geheim}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
