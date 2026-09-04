/**
 * Cards shown in the collapsed `/search` People preview — two full rows of the
 * 2-col grid. "See all" expands the section to the paginated grid.
 */
export const SEARCH_PEOPLE_PREVIEW_COUNT = 4;

/** Users fetched per `search/users/by_tags` page for the `/search` People section. */
export const SEARCH_PEOPLE_PAGE_SIZE = 20;

/**
 * Hard label ceiling of the Nexus `search/users/by_tags` endpoint (1-5; more
 * returns 400). Clamped at the request boundary so the endpoint stays immune
 * to `PUBKY_RUNTIME_MAX_STREAM_TAGS` being raised above 5.
 */
export const SEARCH_PEOPLE_MAX_TAGS = 5;

/**
 * Search suggestions dropdown viewport safety cap
 * - The panel hugs its content (#1840 design: no internal scrolling); this cap only
 *   stops it from overflowing short viewports, where overflow-y-auto kicks in as a
 *   fallback. The offset covers the header and search input above the dropdown.
 */
const SEARCH_SUGGESTIONS_MAX_HEIGHT = 'calc(100dvh - 10rem)';

/**
 * Limits for the full-text `?q=` query, enforced by `validateContentSearchQuery`,
 * which also interpolates them into its user-facing error messages.
 */
export const CONTENT_SEARCH_QUERY_MIN_LENGTH = 2;
export const CONTENT_SEARCH_QUERY_MAX_LENGTH = 30;
export const CONTENT_SEARCH_QUERY_MAX_TERMS = 4;

/** Tag prefix matches fetched per query term for the `/search` full-text Tags row. */
export const SEARCH_CONTENT_TAGS_PER_TERM_LIMIT = 3;

/**
 * Cap of the merged `/search` full-text Tags row — per-term results times
 * `CONTENT_SEARCH_QUERY_MAX_TERMS` could otherwise reach 12 chips.
 */
export const SEARCH_CONTENT_TAGS_MAX_TOTAL = 8;

/**
 * Nexus by_content pagination bound (`BoundedSkip<1000>` in pubky-nexus): a `skip` up to and
 * INCLUDING this value is a valid request; anything above is rejected with a validation error.
 * Content-search streams stop paginating once the next offset would exceed it.
 */
export const CONTENT_SEARCH_MAX_SKIP = 1000;

/**
 * Search bar closed state style (pill shape)
 * - Gradient background matching Figma design
 * - Backdrop blur for glass effect
 */
export const SEARCH_CLOSED_STYLE = {
  background: 'linear-gradient(180deg, #07040a 0%, #1b1820 100%)',
  backdropFilter: 'blur(20px)',
} as const;

/**
 * Search input expanded state style (when dropdown is open)
 * - Solid background to seamlessly connect with dropdown
 */
export const SEARCH_INPUT_EXPANDED_STYLE = {
  background: 'linear-gradient(180deg, var(--background) 0%, var(--background) 100%)',
} as const;

/**
 * Search suggestions dropdown style
 * - Gradient that fades to transparent
 * - Backdrop blur for glass effect
 * - Drop shadow for depth
 */
export const SEARCH_EXPANDED_STYLE = {
  background: 'linear-gradient(180deg, var(--background) 0%, rgba(5, 5, 10, 0.50) 100%)',
  backdropFilter: 'blur(25px)',
  boxShadow: '0px 50px 100px rgba(0, 0, 0, 1)',
  maxHeight: SEARCH_SUGGESTIONS_MAX_HEIGHT,
} as const;
