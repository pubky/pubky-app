export interface VrtViewport {
  width: number;
  height: number;
}

export const VRT_VIEWPORT_DESKTOP: VrtViewport = { width: 1440, height: 900 };

export const VRT_VIEWPORT_MOBILE: VrtViewport = { width: 390, height: 844 };

/** The narrowest phone the app supports (iPhone SE class); dialogs must fit it without scrolling sideways. */
export const VRT_VIEWPORT_NARROW: VrtViewport = { width: 320, height: 568 };
