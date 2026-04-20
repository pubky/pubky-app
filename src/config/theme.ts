/**
 * Theme Configuration
 *
 * Centralized theme constants that match Tailwind CSS v4 breakpoints and design tokens from Figma.
 * These values should be kept in sync with any Tailwind customizations
 *
 * @see https://tailwindcss.com/docs/breakpoints
 */

/**
 * Core color values as hex strings for JavaScript interop
 *
 * These match the CSS custom properties in globals.css but are provided
 * as hex values for use with JavaScript functions (e.g., hexToRgba).
 *
 * CSS equivalent: --background: oklch(0.118 0.014 284.115) ≈ #05050A
 * Figma token: --pubky-colors-core-black
 */
export const COLORS = {
  /** Core black - matches --background CSS variable */
  background: '#05050A',
} as const;

/**
 * Tailwind CSS v4 default breakpoints in pixels
 * Used for responsive design and media query hooks
 */
export const BREAKPOINTS = {
  /** Narrow phones — matches `body` min-width and `--breakpoint-xsm` in globals.css */
  xxs: 375,
  /** Compact mobile: 480px and up */
  xs: 480,
  /** Mobile landscape: 640px and up */
  sm: 640,
  /** Tablets: 768px and up */
  md: 768,
  /** Desktop: 1024px and up */
  lg: 1024,
  /** Large desktop: 1280px and up */
  xl: 1280,
  /** Extra large desktop: 1536px and up */
  '2xl': 1536,
} as const;

/**
 * Breakpoint names available in the theme
 */
export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Helper function to get breakpoint value
 * @param breakpoint - The breakpoint name
 * @returns The breakpoint value in pixels
 */
export function getBreakpoint(breakpoint: Breakpoint): number {
  return BREAKPOINTS[breakpoint];
}
