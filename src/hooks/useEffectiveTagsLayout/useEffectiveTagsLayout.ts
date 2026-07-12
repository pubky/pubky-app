'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';

/**
 * Resolves the inherited tags layout after applying the mobile collapse rule:
 * `side` (wide) on desktop, `inline` on mobile.
 */
export function useEffectiveTagsLayout(): TagsLayout {
  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';

  return inheritedTagsLayout === 'side' && isMobile ? 'inline' : inheritedTagsLayout;
}
