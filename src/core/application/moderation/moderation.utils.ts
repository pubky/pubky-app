import { getModeratedTags, getModerationId } from '@/config/moderation';

/**
 * Detects if a post is moderated based on its tags.
 * Used during post sync to determine if a post should be stored in the moderation table.
 */
export const detectModerationFromTags = (tags: { label: string; taggers: string[] }[] | null | undefined): boolean => {
  if (!tags) return false;
  const moderatedTags = getModeratedTags();
  const moderationId = getModerationId();
  return tags.some((tag) => moderatedTags.includes(tag.label) && tag.taggers.includes(moderationId));
};

/**
 * Determines if content should be blurred based on moderation state and user preferences.
 * Only called when a moderation record exists (item is moderated).
 */
export const shouldBlur = (isBlurred: boolean, isBlurDisabledGlobally: boolean): boolean => {
  if (isBlurDisabledGlobally) return false;
  return isBlurred;
};
