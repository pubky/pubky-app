'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';
import { getEffectiveTagsLayout } from '@/organisms/PostMain/PostMainLayoutRules';

/**
 * Resolves the inherited tags layout after applying the mobile collapse rule:
 * rich layouts (`side` / `list`) stay on desktop and fall back to `inline` on mobile.
 */
export function useEffectiveTagsLayout(): TagsLayout {
  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';

  return getEffectiveTagsLayout(inheritedTagsLayout, isMobile);
}
