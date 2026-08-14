/**
 * Shared constants for dynamic Open Graph / Twitter image generation.
 *
 * `ImageResponse` (satori) cannot resolve CSS variables, so the design tokens
 * are duplicated here as literal hex values sourced from the Figma cards and
 * `src/app/globals.css`.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

/**
 * ISR revalidation window (seconds) for the image route segments. Kept in sync
 * with the upstream Nexus `fetch(..., { next: { revalidate } })` calls.
 */
export const OG_REVALIDATE = 3600;

/**
 * Cache-Control emitted on the `ImageResponse` itself so CDNs / social crawlers
 * cache the rendered PNG aggressively while revalidating in the background.
 */
export const OG_CACHE_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
} as const;

/** Literal hex design tokens (ImageResponse cannot use CSS variables). */
export const OG_TOKENS = {
  // `--background` oklch(0.118 0.014 284.115) → hex (page background; the
  // collection card's count pill on covered chrome — `CollectionCountBadge`'s
  // `bg-background` tone — and the base of the opaque tag-chip blend).
  background: '#05050a',
  cardBg: '#1d1d20',
  avatarMuted: '#303034',
  foreground: '#ffffff',
  secondaryForeground: '#d4d4db',
  mutedForeground: '#89898f',
  brand: '#c8ff00',
} as const;

/** Grapheme-cluster caps per layout region. */
export const OG_TRUNCATE = {
  // ~3 lines at 60px; the text block also hard-caps height so long posts (e.g.
  // ones with unbroken URLs) stay within the centered content area.
  postText: 110,
  // ~2 lines above the image (full width); maxHeight also caps it.
  postImageText: 90,
  // ~3 lines in the narrow (~640px) profile bio column; maxHeight also caps it.
  bio: 78,
  // Tuned so the "…" from grapheme truncation lands within the 2 visible lines
  // (satori's line-clamp ellipsis is unreliable); maxHeight guards against bleed.
  articleBody: 78,
  // Payload guard for the collection card's single-line description (the
  // visual truncation is CSS nowrap + ellipsis).
  collectionDescription: 110,
  // Single tag-chip label on the collection card (chips don't wrap).
  collectionTag: 20,
} as const;
