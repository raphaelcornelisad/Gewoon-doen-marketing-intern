import type { ApiColor, ColorClass } from "./types";

type Rgb = [number, number, number];

/**
 * Referentiekleuren per klasse. De hoofdkleuren uit de opdracht staan vooraan;
 * daarnaast de gangbare tinten uit het standaardpalet van Google Sheets,
 * zodat een iets andere groen/geel/rood ook goed wordt herkend.
 * Oranje tinten tellen als geel.
 */
const ANCHORS: Record<ColorClass, string[]> = {
  groen: ["#34A853", "#00FF00", "#6AA84F", "#93C47D", "#B6D7A8", "#38761D", "#274E13", "#0F9D58"],
  geel: [
    "#FBBC04", "#FFFF00", "#F1C232", "#FFD966", "#FFE599", "#BF9000", "#F4B400",
    // oranje
    "#FF9900", "#FF6D01", "#E69138", "#F6B26B", "#F9CB9C", "#B45F06",
  ],
  rood: ["#EA4335", "#FF0000", "#CC0000", "#E06666", "#EA9999", "#990000", "#DB4437", "#980000"],
  ongekleurd: ["#FFFFFF"],
};

/** Maximale RGB-afstand tot een referentiekleur; daarboven is de kleur onbekend. */
export const COLOR_TOLERANCE = 80;

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const ANCHOR_RGB: { klasse: ColorClass; rgb: Rgb }[] = Object.entries(ANCHORS).flatMap(
  ([klasse, hexes]) => hexes.map((h) => ({ klasse: klasse as ColorClass, rgb: hexToRgb(h) })),
);

export function apiColorToRgb(c: ApiColor): Rgb {
  const ch = (v: number | undefined) => Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255);
  return [ch(c.red), ch(c.green), ch(c.blue)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function classifyRgb(rgb: Rgb | null): ColorClass {
  if (!rgb) return "ongekleurd";
  let best: ColorClass = "ongekleurd";
  let bestDist = Infinity;
  for (const a of ANCHOR_RGB) {
    const d = distance(rgb, a.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = a.klasse;
    }
  }
  return bestDist <= COLOR_TOLERANCE ? best : "ongekleurd";
}

export function classifyHex(hex: string | null): ColorClass {
  return classifyRgb(hex ? hexToRgb(hex) : null);
}
