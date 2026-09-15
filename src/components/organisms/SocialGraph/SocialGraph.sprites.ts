/**
 * Offscreen sprite caches for the graph canvas.
 *
 * Tag chips and post-kind icons are pre-rasterized once and blitted with
 * drawImage on every frame: painting rounded rects and text per node per
 * frame (autoPauseRedraw is off) does not survive a few hundred chips.
 * Tier alpha is applied at blit time via ctx.globalAlpha, so it is never
 * part of a cache key.
 */

import { COLORS } from '@/config/theme';
import type { NexusGraphPostNode } from '@/services/nexus/graph/graph.types';

/** Design px -> device px supersampling for crisp sprites when zoomed in. */
const SPRITE_SCALE = 2;
/** Chip geometry from the design: h 32, r 8, padX 12, label/count gap 6. */
export const CHIP_HEIGHT = 32;
const CHIP_RADIUS = 8;
const CHIP_PAD_X = 12;
const CHIP_GAP = 6;
const CHIP_LABEL_FONT = '700 14px "Inter Tight", sans-serif';
const CHIP_COUNT_FONT = '500 14px "Inter Tight", sans-serif';
/** Chip fill = tag color under a 70% canvas-background overlay (PostTag recipe). */
const CHIP_OVERLAY_ALPHA = 0.7;
/** Bound on distinct (label|count) chip bitmaps kept alive. */
const CHIP_CACHE_CAP = 300;

export type ChipSprite = { canvas: HTMLCanvasElement; w: number; h: number };

const chipCache = new Map<string, ChipSprite>();
const measureCache = new Map<string, number>();
const iconCache = new Map<string, HTMLImageElement>();

let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

// Sprites rasterized before Inter Tight finished loading carry fallback-font
// metrics; one flush when the fonts land re-bakes everything correctly
if (typeof document !== 'undefined') {
  document.fonts?.ready.then(() => {
    chipCache.clear();
    measureCache.clear();
  });
}

function textWidth(font: string, text: string): number {
  const key = `${font}|${text}`;
  const cached = measureCache.get(key);
  if (cached !== undefined) return cached;
  const ctx = measurer();
  if (!ctx) return text.length * 8;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  measureCache.set(key, width);
  return width;
}

/** Composite of `hex` under the canvas background at the chip overlay alpha. */
export function chipFill(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const bgMatch = /^#([0-9a-f]{6})$/i.exec(COLORS.background) ?? ['', '05050a'];
  const channel = (source: string, i: number) => parseInt(source.slice(i * 2, i * 2 + 2), 16);
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const c = channel(match[1], i);
    const bg = channel(bgMatch[1], i);
    out += toHex(c * (1 - CHIP_OVERLAY_ALPHA) + bg * CHIP_OVERLAY_ALPHA);
  }
  return out;
}

/** Chip box in graph units for painters and pointer areas (no sprite forced). */
export function chipMetrics(label: string, count: number | null): { w: number; h: number } {
  const labelW = textWidth(CHIP_LABEL_FONT, label);
  const countW = count !== null ? CHIP_GAP + textWidth(CHIP_COUNT_FONT, String(count)) : 0;
  return { w: CHIP_PAD_X + labelW + countW + CHIP_PAD_X, h: CHIP_HEIGHT };
}

/**
 * Pre-rasterized tag chip. `accent` is the raw tag color; the fill applies
 * the design's dark overlay. Insertion-order LRU keeps memory bounded on
 * long exploration sessions.
 */
export function chipSprite(label: string, count: number | null, accent: string): ChipSprite | null {
  if (typeof document === 'undefined') return null;
  const key = `${label}|${count ?? ''}|${accent}`;
  const cached = chipCache.get(key);
  if (cached) {
    // Refresh LRU position
    chipCache.delete(key);
    chipCache.set(key, cached);
    return cached;
  }

  const { w, h } = chipMetrics(label, count);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * SPRITE_SCALE);
  canvas.height = Math.ceil(h * SPRITE_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);

  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, CHIP_RADIUS);
  ctx.fillStyle = chipFill(accent);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = CHIP_LABEL_FONT;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, CHIP_PAD_X, h / 2 + 0.5);
  if (count !== null) {
    ctx.font = CHIP_COUNT_FONT;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(String(count), CHIP_PAD_X + textWidth(CHIP_LABEL_FONT, label) + CHIP_GAP, h / 2 + 0.5);
  }

  const sprite: ChipSprite = { canvas, w, h };
  chipCache.set(key, sprite);
  if (chipCache.size > CHIP_CACHE_CAP) {
    const oldest = chipCache.keys().next().value;
    if (oldest !== undefined) chipCache.delete(oldest);
  }
  return sprite;
}

// Post glyph vector data, copied verbatim from the installed lucide-react
// (importing each icon's dist module for its __iconNode is not a public API).
// Kind mapping mirrors FilterContent.tsx: short/long/image/video/link/file;
// `reply` is MessageCircle, the app's reply glyph (actions bar, replies tab).
type IconShape = [string, Record<string, string>];
const ICON_NODES: Record<string, IconShape[]> = {
  reply: [
    [
      'path',
      {
        d: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
      },
    ],
  ],
  short: [
    [
      'path',
      {
        d: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z',
      },
    ],
    ['path', { d: 'M15 3v5a1 1 0 0 0 1 1h5' }],
  ],
  long: [
    ['path', { d: 'M15 18h-5' }],
    ['path', { d: 'M18 14h-8' }],
    ['path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2' }],
    ['rect', { width: '8', height: '4', x: '10', y: '6', rx: '1' }],
  ],
  image: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
    ['circle', { cx: '9', cy: '9', r: '2' }],
    ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
  ],
  video: [
    ['path', { d: 'M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z' }],
    ['circle', { cx: '12', cy: '12', r: '10' }],
  ],
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
  file: [
    ['path', { d: 'M12 15V3' }],
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['path', { d: 'm7 10 5 5 5-5' }],
  ],
};

function iconMarkup(shapes: IconShape[]): string {
  const body = shapes
    .map(([tag, attrs]) => {
      const serialized = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${serialized}/>`;
    })
    .join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    body +
    '</svg>'
  );
}

/** Glyph key for a post node: replies read as replies whatever their content kind. */
export function postGlyph(node: Pick<NexusGraphPostNode, 'post_kind' | 'is_reply'>): string {
  return node.is_reply ? 'reply' : node.post_kind;
}

/**
 * White lucide glyph for a post, or null until its bitmap decodes
 * (the continuous repaint loop picks it up on a later frame, like avatars).
 */
export function postIconSprite(glyph: string): HTMLImageElement | null {
  if (typeof document === 'undefined') return null;
  const kind = ICON_NODES[glyph] ? glyph : 'short';
  const cached = iconCache.get(kind);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const img = new Image();
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(iconMarkup(ICON_NODES[kind]))}`;
  iconCache.set(kind, img);
  return null;
}
