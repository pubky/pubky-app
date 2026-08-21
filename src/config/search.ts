/**
 * Search suggestions dropdown viewport safety cap
 * - The panel hugs its content (#1840 design: no internal scrolling); this cap only
 *   stops it from overflowing short viewports, where overflow-y-auto kicks in as a
 *   fallback. The offset covers the header and search input above the dropdown.
 */
const SEARCH_SUGGESTIONS_MAX_HEIGHT = 'calc(100dvh - 10rem)';

export const CONTENT_SEARCH_QUERY_MIN_LENGTH = 2;
export const CONTENT_SEARCH_QUERY_MAX_LENGTH = 30;
export const CONTENT_SEARCH_QUERY_MAX_TERMS = 4;

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
