/**
 * Canvas color resolution for the social graph.
 *
 * The 2D canvas cannot consume CSS variables, so tokens are read once from
 * the document root and normalized to hex (the paint code derives alpha
 * variants through hexToRgba, which only parses hex), with hex fallbacks
 * mirroring globals.css in the shared COLORS config.
 */

import { COLORS } from '@/config/theme';
import { cssColorToHex } from '@/libs/utils/utils';

export type GraphTheme = {
  self: string;
  friend: string;
  following: string;
  follower: string;
  extended: string;
  post: string;
  edgeMuted: string;
  label: string;
  halo: string;
};

/** Hex fallbacks approximating the OKLCH tokens in globals.css */
export const GRAPH_FALLBACK_COLORS: GraphTheme = { ...COLORS.graph };

const TOKEN_BY_KEY: Partial<Record<keyof GraphTheme, string>> = {
  self: '--brand',
  friend: '--chart-2',
  following: '--chart-3',
  follower: '--chart-1',
};

/** Colors below this perceived luminance get lifted before canvas painting. */
const MIN_CANVAS_LUMINANCE = 0.35;
/** Target HSL lightness for lifted colors. */
const LIFTED_LIGHTNESS = 0.55;

/**
 * Lifts a #rrggbb color to a readable brightness so label-derived hues (which
 * can hash to near-black navies and maroons) stay visible on the dark canvas.
 * Gated on perceived luminance, not HSL lightness: saturated greens/yellows
 * read bright at L=0.5 while blues need the lift. Bright colors and non-hex
 * input pass through unchanged.
 */
export function liftForDarkCanvas(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luminance >= MIN_CANVAS_LUMINANCE) return hex;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  // hex -> HSL, clamp L, HSL -> hex
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const l = Math.max(lightness, LIFTED_LIGHTNESS);
  const c = (1 - Math.abs(2 * l - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let [nr, ng, nb] = [0, 0, 0];
  if (hue < 60) [nr, ng, nb] = [c, x, 0];
  else if (hue < 120) [nr, ng, nb] = [x, c, 0];
  else if (hue < 180) [nr, ng, nb] = [0, c, x];
  else if (hue < 240) [nr, ng, nb] = [0, x, c];
  else if (hue < 300) [nr, ng, nb] = [x, 0, c];
  else [nr, ng, nb] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

// Recency ramp endpoints for neighbor-to-neighbor follow edges: old
// connections recede into cool gray, fresh ones glow warm white
const EDGE_OLD = { r: 108, g: 110, b: 122, a: 0.12 };
const EDGE_FRESH = { r: 246, g: 240, b: 222, a: 0.62 };

/**
 * Color for a follow edge by normalized recency t (0 = oldest in view,
 * 1 = freshest). Spotlight-dimmed edges collapse to the shared dim alpha.
 */
export function edgeRecencyColor(t: number, dimmed: boolean): string {
  const clamped = Math.min(1, Math.max(0, t));
  const r = Math.round(EDGE_OLD.r + (EDGE_FRESH.r - EDGE_OLD.r) * clamped);
  const g = Math.round(EDGE_OLD.g + (EDGE_FRESH.g - EDGE_OLD.g) * clamped);
  const b = Math.round(EDGE_OLD.b + (EDGE_FRESH.b - EDGE_OLD.b) * clamped);
  const a = dimmed ? 0.04 : EDGE_OLD.a + (EDGE_FRESH.a - EDGE_OLD.a) * clamped;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

export function resolveGraphTheme(): GraphTheme {
  if (typeof window === 'undefined') return GRAPH_FALLBACK_COLORS;
  const style = getComputedStyle(document.documentElement);
  const theme = { ...GRAPH_FALLBACK_COLORS };
  for (const [key, token] of Object.entries(TOKEN_BY_KEY) as [keyof GraphTheme, string][]) {
    // Anything non-normalizable (no canvas, out-of-gamut serialization,
    // parse failure) keeps the fallback
    const normalized = cssColorToHex(style.getPropertyValue(token).trim());
    if (normalized) theme[key] = normalized;
  }
  theme.halo = theme.self;
  return theme;
}
