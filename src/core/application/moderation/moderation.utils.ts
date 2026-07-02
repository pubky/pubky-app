import { getModeratedTags, getModerationId } from '@/config/moderation';

// detectModerationFromTags runs once per synced post; the moderated-tag list comes from the
// memoized runtime config, so its array identity is stable per process/page load. Cache the
// derived Set keyed on that identity instead of rebuilding it on every call.
let moderatedTagSetSource: string[] | null = null;
let moderatedTagSet: Set<string> = new Set();

function getModeratedTagSet(): Set<string> {
  const source = getModeratedTags();
  if (source !== moderatedTagSetSource) {
    moderatedTagSetSource = source;
    moderatedTagSet = new Set(source);
  }
  return moderatedTagSet;
}

/**
 * Detects if a post is moderated based on its tags.
 * Used during post sync to determine if a post should be stored in the moderation table.
 */
export const detectModerationFromTags = (tags: { label: string; taggers: string[] }[] | null | undefined): boolean => {
  if (!tags) return false;
  const tagSet = getModeratedTagSet();
  const moderationId = getModerationId();
  return tags.some((tag) => tagSet.has(tag.label) && tag.taggers.includes(moderationId));
};

/**
 * Determines if content should be blurred based on moderation state and user preferences.
 * Only called when a moderation record exists (item is moderated).
 */
export const shouldBlur = (isBlurred: boolean, isBlurDisabledGlobally: boolean): boolean => {
  if (isBlurDisabledGlobally) return false;
  return isBlurred;
};
