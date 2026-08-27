import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { getCharacterCount } from '@/libs/utils/utils';

/** Title shown when the creator typed none; also what the composer seeds the field with. */
export const DEFAULT_LOCK_TITLE = 'Locked content';

/** JSON envelope stored (stringified) in the announcement's `content`. Owned by pubky.app, not the spec. */
export type TLockTeaser = {
  lock_title: string;
  teaser_description: string;
};

/** Picks the two fields by name, so a new field is never published before we count its length. */
export function buildLockTeaserContent({ lock_title, teaser_description }: TLockTeaser): string {
  return JSON.stringify({ lock_title, teaser_description });
}

/** Measures the serialized string, because JSON escaping adds characters. Counts code points, as the spec does. */
export function isLockTeaserWithinLimit(teaser: TLockTeaser): boolean {
  return getCharacterCount(buildLockTeaserContent(teaser)) <= POST_MAX_CHARACTER_LENGTH;
}
