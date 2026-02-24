/**
 * Layout dimension constants for the application.
 *
 * These values are the JavaScript equivalents of CSS variables defined in globals.css.
 * They are needed for JavaScript calculations (e.g., useStickyWhenFits hook)
 * where CSS variables cannot be used directly.
 *
 * ⚠️ IMPORTANT: Keep these values in sync with the CSS variables in globals.css:
 *   - --header-height: 146px
 *   - --header-offset-main: 150px
 *
 * @see src/app/globals.css for CSS variable definitions and detailed rationale
 */
export const LAYOUT = {
  /**
   * Profile page header height in pixels.
   * Used for sticky positioning of filter bars and sidebars on profile pages.
   *
   * CSS equivalent: --header-height: 146px
   */
  HEADER_HEIGHT_PROFILE: 146,

  /**
   * Main content header offset in pixels.
   * Vertical offset for sticky sidebars and floating elements below main header.
   *
   * CSS equivalent: --header-offset-main: 150px
   *
   * Value rationale:
   * - Header outer container: py-6 (24px top + 24px bottom) = 48px
   * - Header inner container: py-6 (24px top + 24px bottom) = 48px
   * - Header content height (buttons h-12) = 48px
   * - Total header visual height ~144px, rounded up to 150px for spacing
   */
  HEADER_OFFSET_MAIN: 150,

  /**
   * Bottom offset for sidebar sticky behavior in pixels.
   * Accounts for bottom padding (pb-12 = 3rem = 48px).
   */
  SIDEBAR_BOTTOM_OFFSET: 48,
} as const;

/**
 * Type for the LAYOUT object values
 */
export type LayoutValue = (typeof LAYOUT)[keyof typeof LAYOUT];
