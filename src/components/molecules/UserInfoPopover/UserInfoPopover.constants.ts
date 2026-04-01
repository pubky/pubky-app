/** Horizontal offset for popover alignment to match post left edge */
export const POPOVER_ALIGN_OFFSET = -24;

/** Vertical offset for popover positioning from trigger */
export const POPOVER_SIDE_OFFSET = 1;

/** Delay in milliseconds before showing the popover on hover */
export const POPOVER_HOVER_DELAY = 500;

/** Initial popover height estimate used before any measured height is available. */
export const STABLE_POPOVER_ESTIMATED_HEIGHT = 220;

/** Default viewport padding for stable vertical placement mode. */
export const DEFAULT_STABLE_POPOVER_VIEWPORT_PADDING = {
  top: 0,
  bottom: 16,
} as const;

/** Fallback timeout to stop rendering popover content after close animation should have finished. */
export const STABLE_POPOVER_CLOSE_RENDER_TIMEOUT = 200;
