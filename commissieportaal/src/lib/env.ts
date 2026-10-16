/** Leest een verplichte omgevingsvariabele; faalt duidelijk als die ontbreekt. */
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Omgevingsvariabele ${name} ontbreekt`);
  return v;
}
