import { LOCK_TEASER_MAX_CHARACTER_LENGTH, POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { getCharacterCount } from '@/libs/utils/utils';
import { lockPostContentSchema } from '@/services/locks/locks.types';

/** Title shown when the creator typed none; also what the composer seeds the field with. */
export const DEFAULT_LOCK_TITLE = 'Locked content';

/** JSON envelope stored (stringified) in the announcement's `content`. Owned by pubky.app, not the spec. */
export type TLockTeaser = {
  lock_title: string;
  teaser_description: string;
  /**
   * The locked post's kind (#2433), carried raw so an edit writes back a kind this build does not know.
   * Omitted from the JSON when unset, so an old lock re-serializes unchanged.
   */
  content_kind?: string;
};

/** Picks the fields by name, so a new field is never published before we count its length. */
export function buildLockTeaserContent({ lock_title, teaser_description, content_kind }: TLockTeaser): string {
  return JSON.stringify({ lock_title, teaser_description, content_kind });
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

/**
 * The composer's teaser max for the envelope actually written: the budget without a kind, less the length of
 * the `content_kind` entry when one is written (#2433). A lock with no kind keeps the old limit.
 */
export function getLockTeaserMaxLength(contentKind?: string): number {
  if (contentKind === undefined) return LOCK_TEASER_MAX_CHARACTER_LENGTH;
  return LOCK_TEASER_MAX_CHARACTER_LENGTH - getCharacterCount(`,"content_kind":${JSON.stringify(contentKind)}`);
}

/** Measures the serialized string, because JSON escaping adds characters. Counts code points, as the spec does. */
export function isLockTeaserWithinLimit(teaser: TLockTeaser): boolean {
  return getCharacterCount(buildLockTeaserContent(teaser)) <= POST_MAX_CHARACTER_LENGTH;
}
