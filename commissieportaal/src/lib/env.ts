/** Leest een verplichte omgevingsvariabele; faalt duidelijk als die ontbreekt. */
export function env(name: string, ...fallbacks: string[]): string {
  for (const n of [name, ...fallbacks]) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`Omgevingsvariabele ${name} ontbreekt`);
}
