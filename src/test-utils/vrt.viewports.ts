export interface VrtViewport {
  width: number;
  height: number;
}

export const VRT_VIEWPORT_DESKTOP: VrtViewport = { width: 1440, height: 900 };

export const VRT_VIEWPORT_MOBILE: VrtViewport = { width: 390, height: 844 };

/** The narrowest phone the app supports (iPhone SE class); dialogs must fit it without scrolling sideways. */
export const VRT_VIEWPORT_NARROW: VrtViewport = { width: 320, height: 568 };

/**
 * Box every capture is scaled down to fit (never up), by
 * `min(1, 1280 / width, 720 / height)` of its viewport: desktop 1440x900 is
 * stored at 1152x720, mobile 390x844 at 333x720, tablet 768x1024 at 540x720.
 * These are the dimensions the baselines have had since Vitest 4, whose
 * 1280x720 headless window produced them.
 */
export const VRT_CAPTURE_MAX_SIZE: VrtViewport = { width: 1280, height: 720 };
