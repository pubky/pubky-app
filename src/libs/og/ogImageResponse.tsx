import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import { OG_CACHE_HEADERS, OG_SIZE } from './ogConstants';
import { getOgFonts } from './ogFonts';

/**
 * Builds a 1200x630 PNG `ImageResponse` with the bundled Inter Tight fonts and
 * the shared cache headers applied. Central factory so every OG route emits an
 * identically-configured image.
 */
export function ogImageResponse(element: ReactElement): ImageResponse {
  return new ImageResponse(element, {
    width: OG_SIZE.width,
    height: OG_SIZE.height,
    fonts: getOgFonts(),
    headers: OG_CACHE_HEADERS,
  });
}
