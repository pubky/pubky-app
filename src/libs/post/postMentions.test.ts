import { describe, expect, it, vi } from 'vitest';
import { extractMentionedPubkys, formatMentionLabel, replaceMentions } from './postMentions';

// Valid 52-char lowercase alphanumeric keys for testing
const PUBKY_A = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
const PUBKY_B = 'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvutsrqponmlk';
// A raw key can itself start with "pubky"; the prefix must still be stripped exactly once.
const PUBKY_STARTING_WITH_PUBKY = `pubky${'o'.repeat(47)}`;

describe('extractMentionedPubkys', () => {
  it('returns no keys when the text has no mentions', () => {
    expect(extractMentionedPubkys('Hello world')).toEqual([]);
    expect(extractMentionedPubkys('')).toEqual([]);
  });

  it('extracts pk: and pubky prefixed mentions without their prefix', () => {
    expect(extractMentionedPubkys(`pk:${PUBKY_A} and pubky${PUBKY_B}`)).toEqual([PUBKY_A, PUBKY_B]);
  });

  it('deduplicates repeated mentions, keeping first-appearance order', () => {
    expect(extractMentionedPubkys(`pk:${PUBKY_B} then pubky${PUBKY_A} then pk:${PUBKY_B}`)).toEqual([PUBKY_B, PUBKY_A]);
  });

  it('only matches standalone tokens (start of text or after whitespace), like remarkMentions', () => {
    expect(extractMentionedPubkys(`https://x.test/pk:${PUBKY_A}`)).toEqual([]);
    expect(extractMentionedPubkys(`foopubky${PUBKY_A}`)).toEqual([]);
    expect(extractMentionedPubkys(`line one\npk:${PUBKY_A}`)).toEqual([PUBKY_A]);
  });

  it('ignores tokens whose key is not exactly 52 lowercase alphanumerics', () => {
    expect(extractMentionedPubkys(`pk:${PUBKY_A.slice(0, 51)} short`)).toEqual([]);
    expect(extractMentionedPubkys(`pk:${PUBKY_A.toUpperCase()} upper`)).toEqual([]);
  });

  it('keeps a raw key that itself starts with pubky intact', () => {
    expect(extractMentionedPubkys(`pubky${PUBKY_STARTING_WITH_PUBKY} hi`)).toEqual([PUBKY_STARTING_WITH_PUBKY]);
    expect(extractMentionedPubkys(`pk:${PUBKY_STARTING_WITH_PUBKY} hi`)).toEqual([PUBKY_STARTING_WITH_PUBKY]);
  });
});

describe('formatMentionLabel', () => {
  it('prefixes a resolved name with @, like PostMentions', () => {
    expect(formatMentionLabel({ pubky: PUBKY_A, name: 'Alice' })).toBe('@Alice');
  });

  it('falls back to the shortened key when the profile has no name', () => {
    const shortened = formatMentionLabel({ pubky: PUBKY_A, name: '' });
    expect(shortened).toBe('abcd...mnop');
    expect(formatMentionLabel({ pubky: PUBKY_A, name: null })).toBe(shortened);
    expect(formatMentionLabel({ pubky: PUBKY_A })).toBe(shortened);
  });
});

describe('replaceMentions', () => {
  it('returns the text unchanged and never calls the resolver when there are no mentions', () => {
    const labelFor = vi.fn(() => 'unused');
    expect(replaceMentions('Hello world', labelFor)).toBe('Hello world');
    expect(labelFor).not.toHaveBeenCalled();
  });

  it('replaces each standalone mention with its label, preserving the leading boundary', () => {
    const labelFor = (pubky: string) => (pubky === PUBKY_A ? '@Alice' : '@Bob');
    expect(replaceMentions(`pk:${PUBKY_A} met\npubky${PUBKY_B} and pk:${PUBKY_A} again`, labelFor)).toBe(
      '@Alice met\n@Bob and @Alice again',
    );
  });

  it('hands the resolver the key without its prefix', () => {
    const labelFor = vi.fn<(pubky: string) => string>(() => 'x');
    replaceMentions(`pk:${PUBKY_A} pubky${PUBKY_B}`, labelFor);
    expect(labelFor.mock.calls.map(([pubky]) => pubky)).toEqual([PUBKY_A, PUBKY_B]);
  });

  it('leaves keys embedded in other text alone', () => {
    const text = `see https://x.test/pk:${PUBKY_A} or foopubky${PUBKY_B}`;
    expect(replaceMentions(text, () => 'REPLACED')).toBe(text);
  });
});
