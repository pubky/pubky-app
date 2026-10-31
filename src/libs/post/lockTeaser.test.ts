import { describe, expect, it } from 'vitest';
import {
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  LOCK_TITLE_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { LOCK_CONTENT_KINDS } from '@/services/locks/locks.types';
import {
  buildLockTeaserContent,
  getLockTeaserMaxLength,
  isLockTeaserWithinLimit,
  parseLockTeaserContent,
} from './lockTeaser';

const teaser = (lock_title: string, teaser_description: string) => ({ lock_title, teaser_description });

describe('buildLockTeaserContent', () => {
  it('serializes both fields in the announcement envelope shape', () => {
    expect(buildLockTeaserContent(teaser('Title', 'Body'))).toBe(
      JSON.stringify({ lock_title: 'Title', teaser_description: 'Body' }),
    );
  });

  it('keeps key order stable so the envelope overhead stays predictable', () => {
    expect(buildLockTeaserContent(teaser('', ''))).toBe('{"lock_title":"","teaser_description":""}');
  });

  it('costs exactly the 41 characters the teaser budget reserves', () => {
    expect(buildLockTeaserContent(teaser('', '')).length).toBe(41);
  });

  it('keeps the teaser input budget of the envelope without a kind', () => {
    expect(LOCK_TEASER_MAX_CHARACTER_LENGTH).toBe(POST_MAX_CHARACTER_LENGTH - LOCK_TITLE_MAX_CHARACTER_LENGTH - 41);
  });

  it('writes content_kind after the two text fields, and leaves it out when unset', () => {
    expect(buildLockTeaserContent({ ...teaser('T', 'B'), content_kind: 'image' })).toBe(
      '{"lock_title":"T","teaser_description":"B","content_kind":"image"}',
    );
    expect(buildLockTeaserContent(teaser('T', 'B'))).toBe('{"lock_title":"T","teaser_description":"B"}');
  });

  // An unmeasured field would pass the guard and then fail the spec, after the lock exists.
  it('drops fields it does not know about', () => {
    const withExtra = { ...teaser('T', 'B'), cover_image: 'x'.repeat(500) };

    expect(buildLockTeaserContent(withExtra)).toBe(buildLockTeaserContent(teaser('T', 'B')));
  });
});

// The composer's max follows the envelope actually written (#2433): a lock with no kind keeps the old budget,
// and one with a kind, known or not, gives up exactly the length of its `content_kind` entry.
describe('getLockTeaserMaxLength', () => {
  it('is the teaser budget when no kind is written', () => {
    expect(getLockTeaserMaxLength(undefined)).toBe(LOCK_TEASER_MAX_CHARACTER_LENGTH);
    expect(getLockTeaserMaxLength()).toBe(LOCK_TEASER_MAX_CHARACTER_LENGTH);
  });

  it.each([undefined, ...LOCK_CONTENT_KINDS, 'podcast'])(
    'fits a full title and a teaser of exactly the max for %s, and not one more',
    (contentKind) => {
      const max = getLockTeaserMaxLength(contentKind);
      const full = {
        ...teaser('a'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH), 'b'.repeat(max)),
        content_kind: contentKind,
      };
      const over = { ...full, teaser_description: 'b'.repeat(max + 1) };

      expect(buildLockTeaserContent(full).length).toBe(POST_MAX_CHARACTER_LENGTH);
      expect(isLockTeaserWithinLimit(full)).toBe(true);
      expect(isLockTeaserWithinLimit(over)).toBe(false);
    },
  );
});

describe('isLockTeaserWithinLimit', () => {
  it('accepts both fields filled to their input maxLengths', () => {
    const full = teaser('a'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH), 'b'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH));

    expect(buildLockTeaserContent(full).length).toBe(POST_MAX_CHARACTER_LENGTH);
    expect(isLockTeaserWithinLimit(full)).toBe(true);
  });

  it('rejects one character past the spec limit', () => {
    const over = teaser('a'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH), 'b'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH + 1));

    expect(buildLockTeaserContent(over).length).toBe(POST_MAX_CHARACTER_LENGTH + 1);
    expect(isLockTeaserWithinLimit(over)).toBe(false);
  });

  // The kind is measured, not just written: a teaser that fits without it can be over with it.
  it('counts content_kind in the length check', () => {
    const fitsWithoutKind = teaser(
      'a'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH),
      'b'.repeat(POST_MAX_CHARACTER_LENGTH - LOCK_TITLE_MAX_CHARACTER_LENGTH - 41),
    );

    expect(isLockTeaserWithinLimit(fitsWithoutKind)).toBe(true);
    expect(isLockTeaserWithinLimit({ ...fitsWithoutKind, content_kind: 'note' })).toBe(false);
  });

  // Why the check measures the serialized string: each of these grows to two characters.
  it('rejects quotes that fit the input but double when escaped', () => {
    const quoted = teaser('', '"'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH));

    expect(quoted.teaser_description.length).toBeLessThanOrEqual(LOCK_TEASER_MAX_CHARACTER_LENGTH);
    expect(isLockTeaserWithinLimit(quoted)).toBe(false);
  });

  it('rejects newlines that fit the input but double when escaped', () => {
    const multiline = teaser('', '\n'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH));

    expect(isLockTeaserWithinLimit(multiline)).toBe(false);
  });

  it('counts escaping in the title too, not just the teaser', () => {
    const escapedTitle = teaser(
      '"'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH),
      'b'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH),
    );

    expect(isLockTeaserWithinLimit(escapedTitle)).toBe(false);
  });

  it('accepts an empty envelope', () => {
    expect(isLockTeaserWithinLimit(teaser('', ''))).toBe(true);
  });

  // The spec counts code points, so an emoji costs one there and two under `.length`.
  it('counts an emoji once, like the spec does', () => {
    const emojiFilled = teaser('', '👍'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH));

    expect(buildLockTeaserContent(emojiFilled).length).toBeGreaterThan(POST_MAX_CHARACTER_LENGTH);
    expect(isLockTeaserWithinLimit(emojiFilled)).toBe(true);
  });

  it('still rejects emoji past the code-point limit', () => {
    const over = teaser('', '👍'.repeat(POST_MAX_CHARACTER_LENGTH - 41 + 1));

    expect(isLockTeaserWithinLimit(over)).toBe(false);
  });
});

describe('parseLockTeaserContent', () => {
  it('reads back what buildLockTeaserContent wrote', () => {
    expect(parseLockTeaserContent(buildLockTeaserContent(teaser('Title', 'Body')))).toEqual(teaser('Title', 'Body'));
  });

  it('returns null for empty content', () => {
    expect(parseLockTeaserContent('')).toBeNull();
  });

  it('returns null for content that is not JSON', () => {
    expect(parseLockTeaserContent('plain text')).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    expect(parseLockTeaserContent('"just a string"')).toBeNull();
  });

  it('returns null for a JSON object that carries neither envelope field', () => {
    expect(parseLockTeaserContent(JSON.stringify({ title: 'My Article', body: 'Body text' }))).toBeNull();
  });

  it('accepts an envelope whose fields are both empty', () => {
    expect(parseLockTeaserContent(JSON.stringify({ lock_title: '', teaser_description: '' }))).toEqual(teaser('', ''));
  });

  it('falls back to empty strings for missing or wrongly typed fields', () => {
    expect(parseLockTeaserContent(JSON.stringify({ lock_title: 42 }))).toEqual(teaser('', ''));
  });

  it('ignores fields the envelope does not define', () => {
    expect(
      parseLockTeaserContent(JSON.stringify({ lock_title: 'Title', teaser_description: 'Body', extra: 1 })),
    ).toEqual(teaser('Title', 'Body'));
  });

  // #2433: the reader parse must never fail on the kind, or the lock post renders as nothing.
  it('reads back a saved content kind', () => {
    const withKind = { ...teaser('Title', 'Body'), content_kind: 'video' as const };

    expect(parseLockTeaserContent(buildLockTeaserContent(withKind))).toEqual(withKind);
  });

  // An edit writes the stored value back unchanged, so a kind this build does not know is carried raw.
  it.each(['podcast', 'collection'])('keeps the unknown content kind %s as written', (kind) => {
    const parsed = parseLockTeaserContent(JSON.stringify({ ...teaser('T', 'B'), content_kind: kind }));

    expect(parsed).toEqual({ ...teaser('T', 'B'), content_kind: kind });
  });

  it.each([
    ['missing (a lock from before #2433)', '{"lock_title":"T","teaser_description":"B"}'],
    ['not a string', '{"lock_title":"T","teaser_description":"B","content_kind":7}'],
    ['null', '{"lock_title":"T","teaser_description":"B","content_kind":null}'],
  ])('parses with no content kind when it is %s', (_name, content) => {
    const parsed = parseLockTeaserContent(content);

    expect(parsed).not.toBeNull();
    expect(parsed?.lock_title).toBe('T');
    expect(parsed?.teaser_description).toBe('B');
    expect(parsed?.content_kind).toBeUndefined();
  });
});
