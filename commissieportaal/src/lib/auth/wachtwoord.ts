import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt-hash met eigen salt: "scrypt$<salt>$<hash>" (beide base64url). */
export function hashWachtwoord(w: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${scryptSync(w, salt, 64).toString("base64url")}`;
}

export function controleerWachtwoord(w: string, opgeslagen: string | null): boolean {
  const [soort, salt, hash] = (opgeslagen ?? "").split("$");
  if (soort !== "scrypt" || !salt || !hash) return false;
  const verwacht = Buffer.from(hash, "base64url");
  const echt = scryptSync(w, Buffer.from(salt, "base64url"), verwacht.length);
  return echt.length === verwacht.length && timingSafeEqual(echt, verwacht);
}

export const sterkGenoeg = (w: string) => w.length >= 10;

/** Alleen interne paden als doorverwijzing (geen //andere-site). */
export const veiligPad = (p: string | null | undefined, standaard = "/crm") => (p && /^\/(?!\/)[\w\-/?=&.%]*$/.test(p) ? p : standaard);
