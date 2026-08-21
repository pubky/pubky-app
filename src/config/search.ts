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
 * Maximum height for search suggestions dropdown
 * - Prevents dropdown from taking up entire screen on mobile
 * - Enables scrolling when content exceeds this height
 * - Applied consistently across all device sizes
 */
const SEARCH_SUGGESTIONS_MAX_HEIGHT = 300;

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
  maxHeight: `${SEARCH_SUGGESTIONS_MAX_HEIGHT}px`,
} as const;
