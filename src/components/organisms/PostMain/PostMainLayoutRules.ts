import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import type { TagsLayout } from './PostMain.types';
import { WIDE_POST_BODY_TEXT_CLASS } from './PostMainTypography';

const POST_INPUT_PADDING_CLASS: Record<TagsLayout, string> = {
  inline: 'p-6',
  side: 'p-12',
  list: 'p-6',
};

const POST_INPUT_BODY_TEXT_CLASS: Record<TagsLayout, string | undefined> = {
  inline: undefined,
  side: WIDE_POST_BODY_TEXT_CLASS,
  list: 'text-base',
};

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

/** Wide and list layouts opt into expanded PostInput treatment. List applies local compact styling overrides. */
export function usesWidePostInput(tagsLayout: TagsLayout): boolean {
  return tagsLayout === 'side' || tagsLayout === 'list';
}

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

export function getPostInputPaddingClass(tagsLayout: TagsLayout): string {
  return POST_INPUT_PADDING_CLASS[tagsLayout];
}

export function getPostInputBodyTextClass(tagsLayout: TagsLayout): string | undefined {
  return POST_INPUT_BODY_TEXT_CLASS[tagsLayout];
}
