import { createHmac, timingSafeEqual } from "node:crypto";

/** Controleert de Calendly-handtekening: header "t=<unix>,v1=<hmac-sha256 van `${t}.${body}`>", max. 5 min oud. */
export function geldigeHandtekening(raw: string, header: string | null, key: string, nu = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(nu / 1000 - t) > 300) return false;
  const verwacht = createHmac("sha256", key).update(`${parts.t}.${raw}`).digest("hex");
  const a = Buffer.from(verwacht);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

