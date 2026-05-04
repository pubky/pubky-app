import { MODERATED_TAGS, MODERATION_ID } from '@/config/moderation';

const MODERATED_TAG_SET = new Set(MODERATED_TAGS);

/**
 * Detects if a post is moderated based on its tags.
 * Used during post sync to determine if a post should be stored in the moderation table.
 */
export const detectModerationFromTags = (tags: { label: string; taggers: string[] }[] | null | undefined): boolean => {
  if (!tags) return false;
  return tags.some((tag) => MODERATED_TAG_SET.has(tag.label) && tag.taggers.includes(MODERATION_ID));
};

/**
 * Determines if content should be blurred based on moderation state and user preferences.
 * Only called when a moderation record exists (item is moderated).
 */
export const shouldBlur = (isBlurred: boolean, isBlurDisabledGlobally: boolean): boolean => {
  if (isBlurDisabledGlobally) return false;
  return isBlurred;
};
