'use client';

import { getTagDayPalette } from '@/libs/utils/tagPalette';
import { useAppearanceStore } from '@/stores/appearance/appearance.store';

/**
 * Day mode chip colours for a tag colour in the user's chosen light theme mapping
 * (Settings → Appearance → Tag colors in Light mode). Re-renders when the choice changes.
 */
export function useTagDayPalette(color: string) {
  const tagLightPalette = useAppearanceStore((state) => state.tagLightPalette);
  return getTagDayPalette(color, tagLightPalette);
}
