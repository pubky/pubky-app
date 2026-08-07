import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { getCharacterCount } from '@/libs/utils/utils';

/** JSON envelope stored (stringified) in the announcement's `content`. Owned by pubky.app, not the spec. */
export type TLockTeaser = {
  lock_title: string;
  teaser_description: string;
};

/** Destructured, not passed through, so the key order the 41-char reservation assumes cannot drift. */
export function buildLockTeaserContent({ lock_title, teaser_description }: TLockTeaser): string {
  return JSON.stringify({ lock_title, teaser_description });
}

/**
 * Measures the serialized envelope: JSON escaping expands quotes and newlines past the per-field
 * limits. Code points, because that is what the spec counts (`chars().count()`).
 */
export function isLockTeaserWithinLimit(teaser: TLockTeaser): boolean {
  return getCharacterCount(buildLockTeaserContent(teaser)) <= POST_MAX_CHARACTER_LENGTH;
}
