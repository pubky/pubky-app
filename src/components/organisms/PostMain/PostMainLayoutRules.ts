import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import type { TagsLayout } from './PostMain.types';

/**
 * Canonical mapping from app layout mode to post tags layout.
 * Surface entry points derive this once, then downstream post renderers inherit it.
 */
export function getTagsLayoutForSurfaceLayout(layout: LayoutType): TagsLayout {
  return layout === LAYOUT.WIDE ? 'side' : 'inline';
}
