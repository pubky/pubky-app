import type { TagsLayout } from './PostMain.types';

export const WIDE_POST_BODY_TEXT_CLASS = 'text-xl leading-7';
export const LIST_POST_BODY_TEXT_CLASS = 'text-base font-medium leading-5';

/** Composer body text by layout — shared so PostInput and QuickReply never drift. */
export const BODY_TEXT_CLASS_BY_TAGS_LAYOUT: Record<TagsLayout, string | undefined> = {
  side: WIDE_POST_BODY_TEXT_CLASS,
  list: LIST_POST_BODY_TEXT_CLASS,
  inline: undefined,
};
