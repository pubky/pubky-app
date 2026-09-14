import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { getCharacterCount } from '@/libs/utils/utils';

/** Title shown when the creator typed none; also what the composer seeds the field with. */
export const DEFAULT_LOCK_TITLE = 'Locked content';

/** JSON envelope stored (stringified) in the announcement's `content`. Owned by pubky.app, not the spec. */
export type TLockTeaser = {
  lock_title: string;
  teaser_description: string;
};

/**
 * Strict counterpart to the read parser, which coerces anything missing or mistyped to `''`. The edit
 * composer re-serializes what it parses, so it has to recognise the envelope exactly — otherwise
 * content it only half understood is written back as two empty strings. Mirrors `parseArticleContent`.
 */
export function parseLockTeaserContent(content: string): TLockTeaser | null {
  let parsed: Partial<TLockTeaser>;
  try {
    parsed = JSON.parse(content) as Partial<TLockTeaser>;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.lock_title !== 'string') return null;
  if (typeof parsed.teaser_description !== 'string') return null;

  return { lock_title: parsed.lock_title, teaser_description: parsed.teaser_description };
}

/** Picks the two fields by name, so a new field is never published before we count its length. */
export function buildLockTeaserContent({ lock_title, teaser_description }: TLockTeaser): string {
  return JSON.stringify({ lock_title, teaser_description });
}

/** Measures the serialized string, because JSON escaping adds characters. Counts code points, as the spec does. */
export function isLockTeaserWithinLimit(teaser: TLockTeaser): boolean {
  return getCharacterCount(buildLockTeaserContent(teaser)) <= POST_MAX_CHARACTER_LENGTH;
}
