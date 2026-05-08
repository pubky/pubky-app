/**
 * UI Component Variants
 * Shared constants for component variants used across the application
 */

/** Default Radix tooltip delay for app-wide `TooltipProvider` (root layout). */
export const TOOLTIP_DELAY_MS = 400;

/**
 * Menu display variants
 * Used for components that can render as either a dropdown (desktop) or sheet (mobile)
 */
export const MENU_VARIANT = {
  DROPDOWN: 'dropdown',
  SHEET: 'sheet',
} as const;

export type MenuVariant = (typeof MENU_VARIANT)[keyof typeof MENU_VARIANT];
