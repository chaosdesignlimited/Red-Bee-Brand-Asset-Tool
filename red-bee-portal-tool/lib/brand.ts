// Red Bee 2026 brand palette and colour maths.
//
// This module is intentionally DOM-free so it stays isomorphic (usable on the
// server and in tests) and can be imported by the pure SVG generator.
//
// These are the ONLY colours the tool may use. Source: Red Bee Brand
// Guidelines v1.0 (2026 draft), "Colour" section.

export type Family = 'red' | 'blue' | 'violet' | 'green';
export type Shade = 400 | 500 | 600 | 700 | 800 | 900;

export const PALETTE: Record<Family, Record<Shade, string>> = {
  red: { 400: '#dc281e', 500: '#b92118', 600: '#961b12', 700: '#73140d', 800: '#500e07', 900: '#2d0701' },
  blue: { 400: '#68cffb', 500: '#53aad4', 600: '#3e85ae', 700: '#2a6087', 800: '#153b61', 900: '#00163a' },
  // NOTE: Violet 400 (#ed96f5) is marked "TBC" in the 2026 draft guidelines and may change.
  violet: { 400: '#ed96f5', 500: '#c77bcb', 600: '#a060a1', 700: '#7a4477', 800: '#53294d', 900: '#2d0e23' },
  green: { 400: '#89e576', 500: '#73c063', 600: '#5d9b50', 700: '#46753c', 800: '#305029', 900: '#1a2b16' },
};

// Display order for the palette control. Red leads.
export const FAMILIES: Family[] = ['red', 'blue', 'green', 'violet'];

export const FAMILY_LABEL: Record<Family, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  violet: 'Violet',
};

// The six recession shades, outermost ring -> solid centre.
export const RECESSION_SHADES: Shade[] = [400, 500, 600, 700, 800, 900];

// --- Colour maths ------------------------------------------------------------

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * Shift a hex colour's lightness by `deltaPct` percentage points (of HSL L).
 * Positive lightens, negative darkens. Used for the subtle per-face bevel
 * shading so we never hardcode extra hexes outside the brand palette.
 */
export function adjustLightness(hex: string, deltaPct: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = clamp(hsl.l + deltaPct, 0, 100);
  return rgbToHex(hslToRgb(hsl));
}

export function rgbaString(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
