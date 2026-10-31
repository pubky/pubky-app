import { DEFAULT_TAG_LIGHT_PALETTE, type TagLightPalette } from '@/config/theme';

/**
 * Day mode (light theme) chip colours for a tag colour from `generateRandomColor`, in one of two
 * mappings (`TagLightPalette`).
 *
 * Saturated: Night mode washes the tag colour with 70% near-black and keeps a white label. On a
 * white card the same idea means a deep chip with a white label: the tag's OKLCH hue at mid
 * lightness, lowered until white text reaches WCAG AA. Amber, yellow and lime only reach that
 * contrast as olive or brown, so that band gets a bright chip with a dark label instead
 * (the split Radix Colors uses for step 9: Amber, Yellow and Lime take dark text).
 *
 * Pastel: the Night mode wash in reverse, 70% white over the tag colour (Figma `alpha/30`), with
 * the foreground label. The selected border and hover glow keep the raw tag colour.
 */

interface TagDayPalette {
  /** Chip fill */
  background: string;
  /** Label colour */
  label: string;
  /** Count colour, a softer label */
  count: string;
  /** Selected border and hover glow; a raw neon tag colour disappears on a white card */
  accent: string;
}

type Rgb = [number, number, number];

/** WCAG AA for the 14px bold chip label (not "large text") */
const MIN_WHITE_LABEL_CONTRAST = 4.5;
const DEEP_MIN_LIGHTNESS = 0.48;
const DEEP_MAX_LIGHTNESS = 0.7;
const DEEP_MAX_CHROMA = 0.22;
/** OKLCH lightness a deep chip's edge drops below its fill, so its glow and border show on the fill */
const DEEP_EDGE_DARKEN = 0.16;
const LIGHTNESS_STEP = 0.005;
/** Bright chips keep the source lightness within this range, so amber and orange stay saturated */
const BRIGHT_MIN_LIGHTNESS = 0.78;
const BRIGHT_MAX_LIGHTNESS = 0.89;
const BRIGHT_MAX_CHROMA = 0.17;
const MIN_DARK_LABEL_CONTRAST = 4.5;
/** Light theme `--foreground`, the dark label */
const DARK_LABEL_RGB: Rgb = [0x30 / 255, 0x30 / 255, 0x34 / 255];
/** OKLCH hues (degrees) from amber to lime; from 60° so bitcoin's #FF9900 (64.6°) is amber, not brown */
const BRIGHT_HUE_FROM = 60;
const BRIGHT_HUE_TO = 130;
/** Below this chroma the hue is noise (greys), so never treat it as the bright band */
const MIN_HUED_CHROMA = 0.05;
/** Share of white laid over the tag colour for a pastel chip */
const PASTEL_WHITE_MIX = 0.7;
const GAMUT_SEARCH_STEPS = 24;
const CACHE_LIMIT = 2048;

const WHITE_LABEL = 'var(--color-white)';
const WHITE_COUNT = 'color-mix(in oklab, var(--color-white) 70%, transparent)';
const DARK_LABEL = 'var(--foreground)';
const DARK_COUNT = 'color-mix(in oklab, var(--foreground) 60%, transparent)';

const cache = new Map<string, TagDayPalette>();

function parseHex(color: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((char) => char + char)
          .join('')
      : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const fromLinear = (channel: number) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const whiteContrast = (rgb: Rgb) => 1.05 / (relativeLuminance(rgb) + 0.05);
const darkLabelContrast = (rgb: Rgb) => (relativeLuminance(rgb) + 0.05) / (relativeLuminance(DARK_LABEL_RGB) + 0.05);

function toOklch(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360;
  return [lightness, Math.hypot(a, bAxis), hue];
}

function oklchToLinear(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (linear: Rgb) => linear.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);

/** OKLCH to 8-bit sRGB, reducing chroma (never lightness or hue) until the colour fits. */
function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  let fitted = chroma;
  if (!inGamut(oklchToLinear(lightness, chroma, hue))) {
    let low = 0;
    let high = chroma;
    for (let step = 0; step < GAMUT_SEARCH_STEPS; step++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear(lightness, mid, hue))) low = mid;
      else high = mid;
    }
    fitted = low;
  }
  return oklchToLinear(lightness, fitted, hue).map(
    (channel) => Math.round(Math.min(1, Math.max(0, fromLinear(channel))) * 255) / 255,
  ) as Rgb;
}

function deepChip(lightness: number, chroma: number, hue: number): Rgb {
  const cappedChroma = Math.min(chroma, DEEP_MAX_CHROMA);
  let target = Math.max(DEEP_MIN_LIGHTNESS, Math.min(lightness, DEEP_MAX_LIGHTNESS));
  let rgb = oklchToRgb(target, cappedChroma, hue);
  while (whiteContrast(rgb) < MIN_WHITE_LABEL_CONTRAST && target > 0) {
    target -= LIGHTNESS_STEP;
    rgb = oklchToRgb(target, cappedChroma, hue);
  }
  return rgb;
}

function brightChip(lightness: number, chroma: number, hue: number): Rgb {
  const cappedChroma = Math.min(chroma, BRIGHT_MAX_CHROMA);
  let target = Math.max(BRIGHT_MIN_LIGHTNESS, Math.min(lightness, BRIGHT_MAX_LIGHTNESS));
  let rgb = oklchToRgb(target, cappedChroma, hue);
  while (darkLabelContrast(rgb) < MIN_DARK_LABEL_CONTRAST && target < 1) {
    target += LIGHTNESS_STEP;
    rgb = oklchToRgb(target, cappedChroma, hue);
  }
  return rgb;
}

function buildPastelPalette(rgb: Rgb): TagDayPalette {
  return {
    background: toHex(rgb.map((channel) => channel * (1 - PASTEL_WHITE_MIX) + PASTEL_WHITE_MIX) as Rgb),
    label: DARK_LABEL,
    count: DARK_COUNT,
    accent: toHex(rgb),
  };
}

function buildSaturatedPalette(rgb: Rgb): TagDayPalette {
  const [lightness, chroma, hue] = toOklch(rgb);
  const accent = toHex(deepChip(lightness, chroma, hue));
  const isBright = chroma >= MIN_HUED_CHROMA && hue >= BRIGHT_HUE_FROM && hue <= BRIGHT_HUE_TO;

  if (isBright) {
    return {
      background: toHex(brightChip(lightness, chroma, hue)),
      label: DARK_LABEL,
      count: DARK_COUNT,
      accent,
    };
  }
  const fill = parseHex(accent) as Rgb;
  const [fillLightness, fillChroma, fillHue] = toOklch(fill);
  return {
    background: accent,
    label: WHITE_LABEL,
    count: WHITE_COUNT,
    accent: toHex(oklchToRgb(Math.max(0, fillLightness - DEEP_EDGE_DARKEN), fillChroma, fillHue)),
  };
}

function buildPalette(color: string, mapping: TagLightPalette): TagDayPalette {
  const rgb = parseHex(color);
  if (!rgb) return { background: color, label: DARK_LABEL, count: DARK_COUNT, accent: color };
  return mapping === 'saturated' ? buildSaturatedPalette(rgb) : buildPastelPalette(rgb);
}

/**
 * Day mode chip colours for a tag colour (`#rrggbb` or `#rgb`) in the given mapping, pastel by
 * default. Anything else is returned as the fill with a dark label. Results are memoised per
 * colour and mapping.
 */
export function getTagDayPalette(color: string, mapping: TagLightPalette = DEFAULT_TAG_LIGHT_PALETTE): TagDayPalette {
  const key = `${mapping}:${color.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const palette = buildPalette(color, mapping);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, palette);
  return palette;
}

interface TagPaletteStyleInput {
  /** Night mode fill, as a CSS colour or image depending on the property the component paints */
  nightFill: string;
  /** Night mode border and glow colour */
  nightEdge: string;
  /** Day mode fill, in the same CSS form as `nightFill` */
  dayFill: string;
  day: TagDayPalette;
}

/**
 * Inline custom properties for the `.tag-palette` class in `globals.css`, which resolves
 * `--tag-fill`, `--tag-edge`, `--tag-label` and `--tag-count` for the active theme.
 */
export function getTagPaletteStyle({ nightFill, nightEdge, dayFill, day }: TagPaletteStyleInput): React.CSSProperties {
  return {
    '--tag-night-fill': nightFill,
    '--tag-night-edge': nightEdge,
    '--tag-day-fill': dayFill,
    '--tag-day-edge': day.accent,
    '--tag-day-label': day.label,
    '--tag-day-count': day.count,
  } as React.CSSProperties;
}
