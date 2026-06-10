/**
 * Viewport helpers for component snapshot tests.
 *
 * jsdom defaults to a desktop-sized window (1024x768), so the default snapshot
 * coverage only captures the desktop layout. These helpers resize the jsdom
 * window so viewport-aware hooks (e.g. `useIsMobile`, which reads
 * `window.innerWidth`) render their mobile layout, enabling mobile snapshots.
 */

/**
 * Common mobile viewport used for mobile snapshot tests (iPhone 12 Pro).
 */
export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * Default jsdom desktop viewport, restored after a mobile snapshot test so the
 * rest of the suite keeps rendering its desktop layout.
 */
export const DESKTOP_VIEWPORT = { width: 1024, height: 768 } as const;

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
}

/**
 * Resize the jsdom window to the common mobile viewport.
 * Call before rendering so viewport-aware hooks pick up the mobile width on mount.
 */
export function setMobileViewport(): void {
  setWindowSize(MOBILE_VIEWPORT.width, MOBILE_VIEWPORT.height);
}

/**
 * Restore the jsdom window to its default desktop viewport.
 */
export function resetViewport(): void {
  setWindowSize(DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height);
}
