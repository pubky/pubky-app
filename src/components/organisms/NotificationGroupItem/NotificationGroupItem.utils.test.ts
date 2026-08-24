import { describe, expect, it } from 'vitest';
import { formatGroupedPostTitle, GROUP_POST_TITLE_MAX_LENGTH } from './NotificationGroupItem.utils';

describe('formatGroupedPostTitle', () => {
  it('wraps a short title in double quotes without truncating', () => {
    expect(formatGroupedPostTitle('Based Bitcoin')).toBe('"Based Bitcoin"');
  });

  it('keeps a title of exactly the maximum length intact', () => {
    const title = 'a'.repeat(GROUP_POST_TITLE_MAX_LENGTH);

    expect(formatGroupedPostTitle(title)).toBe(`"${title}"`);
  });

  it('truncates a longer title with an ellipsis', () => {
    const title = 'a'.repeat(GROUP_POST_TITLE_MAX_LENGTH + 10);

    expect(formatGroupedPostTitle(title)).toBe(`"${'a'.repeat(GROUP_POST_TITLE_MAX_LENGTH)}..."`);
  });

  it('never splits an emoji at the cut, truncating by grapheme instead of code unit', () => {
    // 39 chars + 🚀 (2 code units) would slice mid-surrogate with a char-based cut.
    const title = `${'a'.repeat(GROUP_POST_TITLE_MAX_LENGTH - 1)}🚀 and more`;

    expect(formatGroupedPostTitle(title)).toBe(`"${'a'.repeat(GROUP_POST_TITLE_MAX_LENGTH - 1)}🚀..."`);
  });
});
