export interface VrtViewport {
  width: number;
  height: number;
}

export const VRT_VIEWPORT_DESKTOP: VrtViewport = { width: 1440, height: 900 };

export const VRT_VIEWPORT_MOBILE: VrtViewport = { width: 390, height: 844 };

/**
 * The headless orchestrator window every committed baseline was captured
 * through. Vitest 4 ran the tester document in an iframe laid out at the
 * requested viewport inside Playwright's default 1280x720 window and, when
 * the viewport exceeded it, scaled the iframe's wrapper down with a CSS
 * transform — so a 1440x900 desktop capture was committed at 1152x720
 * (x0.8), a 390x844 mobile capture at 333x720 (x720/844), a 768x1024 tablet
 * capture at 540x720, and element captures scaled likewise. Vitest 5 resizes
 * the real window to the requested viewport and rasterizes at natural size,
 * so the harness reproduces the Vitest 4 window + wrapper around each
 * capture (see `vrt.tsx`) to keep the committed references comparable.
 */
export const VRT_CAPTURE_WINDOW: VrtViewport = { width: 1280, height: 720 };
