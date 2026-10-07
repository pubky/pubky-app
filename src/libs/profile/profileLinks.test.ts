import { describe, expect, it } from 'vitest';
import { isXProfileLinkLabel, normalizeProfileLinkUrl } from './profileLinks';

describe('normalizeProfileLinkUrl', () => {
  it('turns a bare X handle into the profile URL (issue #1846)', () => {
    expect(normalizeProfileLinkUrl('X (TWITTER)', '@jack')).toBe('https://x.com/jack');
    expect(normalizeProfileLinkUrl('X (TWITTER)', 'jack')).toBe('https://x.com/jack');
    expect(normalizeProfileLinkUrl('X (TWITTER)', '  @jack_1  ')).toBe('https://x.com/jack_1');
  });

  it('leaves an X profile URL untouched', () => {
    expect(normalizeProfileLinkUrl('X (TWITTER)', 'https://x.com/jack')).toBe('https://x.com/jack');
  });

  it('leaves other links untouched', () => {
    expect(normalizeProfileLinkUrl('WEBSITE', '@jack')).toBe('@jack');
    expect(normalizeProfileLinkUrl('WEBSITE', 'example.com')).toBe('example.com');
  });

  it('trims empty values to empty', () => {
    expect(normalizeProfileLinkUrl('X (TWITTER)', '   ')).toBe('');
  });
});

describe('isXProfileLinkLabel', () => {
  it('matches the X slot regardless of case', () => {
    expect(isXProfileLinkLabel('X (TWITTER)')).toBe(true);
    expect(isXProfileLinkLabel('WEBSITE')).toBe(false);
  });
});
