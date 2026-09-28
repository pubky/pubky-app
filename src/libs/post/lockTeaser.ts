import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { getCharacterCount } from '@/libs/utils/utils';
import { lockPostContentSchema } from '@/services/locks/locks.types';

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

/**
 * Reads an announcement's `content` back. Null when it is empty, not a JSON object, or carries
 * neither envelope field — the schema blanks what it cannot read, so without that key check any
 * other JSON object (an article, a collection) would parse into an empty teaser. An invalid value
 * under a key that is present still falls back to an empty string so the rest renders.
 */
export function parseLockTeaserContent(content: string): TLockTeaser | null {
  if (!content) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  if (typeof raw !== 'object' || raw === null) return null;
  if (!('lock_title' in raw) && !('teaser_description' in raw)) return null;

  const result = lockPostContentSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Measures the serialized string, because JSON escaping adds characters. Counts code points, as the spec does. */
export function isLockTeaserWithinLimit(teaser: TLockTeaser): boolean {
  return getCharacterCount(buildLockTeaserContent(teaser)) <= POST_MAX_CHARACTER_LENGTH;
}
