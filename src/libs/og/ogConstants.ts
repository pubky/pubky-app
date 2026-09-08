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

/**
 * Cache-Control for degraded fallback responses. Deliberately short: the OG
 * routes are not ISR-prerendered (no `generateStaticParams`), so this header is
 * the operative cache policy — carrying `OG_CACHE_HEADERS` here would pin the
 * generic card into CDN/crawler caches for hours after a transient failure
 * (e.g. a post shared seconds before Nexus indexed it).
 */
export const OG_FALLBACK_CACHE_HEADERS = { 'cache-control': 'public, max-age=60' } as const;

/**
 * Timeout for server-side OG image fetches (avatars, attachments, a configured
 * remote preview). Bounds the render worst-case — the fallback path especially
 * runs exactly when upstream is already degraded, so it must not hang on a
 * black-holed host. Matches `NEXUS_SERVER_FETCH_TIMEOUT_MS` so the two
 * sequential stages of a render (Nexus, then images) stay within the few
 * seconds a social crawler waits before caching a miss.
 */
export const OG_IMAGE_FETCH_TIMEOUT_MS = 3000;

/**
 * Largest remote image the OG renderer will download. Every render buffers and
 * decodes the whole file, and Next's data cache refuses entries over 2 MB (so
 * an oversized file is also re-downloaded on every render); anything larger
 * degrades to the image-less card.
 */
export const OG_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upper bound on a whole OG image render, after which the route answers with
 * the generic fallback card instead. Social crawlers abandon slow image
 * fetches (reports place the practical budget in the low single-digit
 * seconds) and cache the miss, so a slow render must still yield *a* card.
 * Deliberately above one upstream timeout plus the fallback render (~3.6s) so
 * an ordinary Nexus/CDN timeout still flows through the renderers' own
 * fallback logic; the deadline only catches stalls those timeouts cannot
 * bound (satori's own emoji/font fetches, a stalled process).
 */
export const OG_RENDER_DEADLINE_MS = 4500;

/** Literal hex design tokens (ImageResponse cannot use CSS variables). */
export const OG_TOKENS = {
  // `--background` oklch(0.118 0.014 284.115) → hex (page background; also the
  // collection card's count-pill background).
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
  // Tuned so the "…" from grapheme truncation lands within the collection
  // card's fixed two-line description slot (satori's line-clamp ellipsis is
  // unreliable; the slot's fixed height + overflow hidden clip anything past
  // the second line).
  collectionDescription: 62,
} as const;
