import { describe, expect, it } from 'vitest';
import {
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  LOCK_TITLE_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { buildLockTeaserContent, isLockTeaserWithinLimit } from './lockTeaser';

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
    expect(LOCK_TEASER_MAX_CHARACTER_LENGTH).toBe(POST_MAX_CHARACTER_LENGTH - LOCK_TITLE_MAX_CHARACTER_LENGTH - 41);
  });

  // An unmeasured field would pass the guard and then fail the spec, after the lock exists.
  it('drops fields it does not know about', () => {
    const withExtra = { ...teaser('T', 'B'), cover_image: 'x'.repeat(500) };

    expect(buildLockTeaserContent(withExtra)).toBe(buildLockTeaserContent(teaser('T', 'B')));
  });
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
    const over = teaser('', '👍'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH + LOCK_TITLE_MAX_CHARACTER_LENGTH + 1));

    expect(isLockTeaserWithinLimit(over)).toBe(false);
  });
});
