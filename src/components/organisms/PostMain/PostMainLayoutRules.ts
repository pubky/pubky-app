import type { PostHeaderSize } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import type { TagsLayout } from './PostMain.types';

/**
 * Canonical mapping from app layout mode to post tags layout.
 * Surface entry points derive this once, then downstream post renderers inherit it.
 */
export function getTagsLayoutForSurfaceLayout(layout: LayoutType): TagsLayout {
  if (layout === LAYOUT.WIDE) {
    return 'side';
  }

  if (layout === LAYOUT.LIST) {
    return 'list';
  }

  return 'inline';
}

/** PostInput header size by tags layout: list = small, wide = large, column = normal. */
export const POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT: Record<TagsLayout, PostHeaderSize> = {
  list: 'normal',
  side: 'extraLarge',
  inline: 'normal',
};

/**
 * Rich feed layouts (wide/list) render as standard inline posts on mobile,
 * matching the wide-layout phone behavior while keeping the wide shell.
 */
export function getEffectiveTagsLayout(tagsLayout: TagsLayout, isMobile: boolean): TagsLayout {
  if (isMobile && (tagsLayout === 'side' || tagsLayout === 'list')) {
    return 'inline';
  }

  return tagsLayout;
}
