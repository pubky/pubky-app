// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseMentions } from './mentions';

const PUBKY_A = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
const PUBKY_B = 'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvutsrqponmlk';
// A raw key can itself start with "pubky"; the prefix is still stripped exactly once.
const PUBKY_STARTING_WITH_PUBKY = `pubky${'o'.repeat(47)}`;

describe('parseMentions', () => {
  it('finds nothing in text without mentions, or in empty text', () => {
    expect(parseMentions('Hello world')).toEqual([]);
    expect(parseMentions('')).toEqual([]);
  });

  it('reads both prefixes, at the start and after any whitespace, each key once in order', () => {
    expect(parseMentions(`pk:${PUBKY_A} met\npubky${PUBKY_B} and pk:${PUBKY_A}`)).toEqual([PUBKY_A, PUBKY_B]);
    expect(parseMentions(`hi\tpk:${PUBKY_B} pk:${PUBKY_A}`)).toEqual([PUBKY_B, PUBKY_A]);
  });

  it('strips the prefix once from a key that itself starts with pubky', () => {
    expect(parseMentions(`pk:${PUBKY_A} pubky${PUBKY_B} pubky${PUBKY_STARTING_WITH_PUBKY}`)).toEqual([
      PUBKY_A,
      PUBKY_B,
      PUBKY_STARTING_WITH_PUBKY,
    ]);
  });

  it.each([
    ['inside a URL', `https://x.test/pk:${PUBKY_A}`],
    ['glued to a word', `foopubky${PUBKY_A}`],
    ['too short', `pk:${PUBKY_A.slice(0, 51)}`],
    ['uppercase', `pk:${PUBKY_A.toUpperCase()}`],
    ['without a prefix', PUBKY_A],
  ])('ignores a key %s', (_name, text) => {
    expect(parseMentions(text)).toEqual([]);
  });
});
