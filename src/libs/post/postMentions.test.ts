import { describe, expect, it, vi } from 'vitest';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { formatMentionLabel, type MentionSegment, splitMentions, truncateSegmentsByGraphemes } from './postMentions';

// Valid 52-char lowercase alphanumeric keys for testing
const PUBKY_A = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
const PUBKY_B = 'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvutsrqponmlk';
// A raw key can itself start with "pubky"; the prefix must still be stripped exactly once.
const PUBKY_STARTING_WITH_PUBKY = `pubky${'o'.repeat(47)}`;

const plain = (text: string): MentionSegment => ({ text, isMention: false });
const mention = (text: string, pubky = PUBKY_A): MentionSegment => ({ text, isMention: true, pubky });
const flatten = (segments: MentionSegment[]) => segments.map((segment) => segment.text).join('');

describe('formatMentionLabel', () => {
  it('prefixes a resolved name with @, like PostMentions', () => {
    expect(formatMentionLabel({ pubky: PUBKY_A, name: 'Alice' })).toBe('@Alice');
  });

  it('falls back to the shortened key, upper-cased as the app renders it', () => {
    const shortened = formatMentionLabel({ pubky: PUBKY_A, name: '' });
    expect(shortened).toBe('ABCD...MNOP');
    expect(formatMentionLabel({ pubky: PUBKY_A, name: null })).toBe(shortened);
    expect(formatMentionLabel({ pubky: PUBKY_A })).toBe(shortened);
  });
});

describe('splitMentions', () => {
  const labelFor = (pubky: string) => (pubky === PUBKY_A ? '@Alice' : '@Bob');

  it('returns a single plain run (or nothing for empty text) when there are no mentions', () => {
    const labelSpy = vi.fn(labelFor);
    expect(splitMentions('Hello world', labelSpy)).toEqual([plain('Hello world')]);
    expect(splitMentions('', labelSpy)).toEqual([]);
    expect(labelSpy).not.toHaveBeenCalled();
  });

  it('splits into plain runs and labelled mention runs carrying their key, boundary kept in the plain run', () => {
    expect(splitMentions(`pk:${PUBKY_A} met\npubky${PUBKY_B} and pk:${PUBKY_A}`, labelFor)).toEqual([
      mention('@Alice'),
      plain(' met\n'),
      mention('@Bob', PUBKY_B),
      plain(' and '),
      mention('@Alice'),
    ]);
  });

  it('hands the resolver the key without its prefix, including a key that itself starts with pubky', () => {
    const labelSpy = vi.fn<(pubky: string) => string>(() => 'x');
    splitMentions(`pk:${PUBKY_A} pubky${PUBKY_B} pubky${PUBKY_STARTING_WITH_PUBKY}`, labelSpy);
    expect(labelSpy.mock.calls.map(([pubky]) => pubky)).toEqual([PUBKY_A, PUBKY_B, PUBKY_STARTING_WITH_PUBKY]);
  });

  it('only matches standalone tokens (start of text or after whitespace), like remarkMentions', () => {
    for (const text of [`https://x.test/pk:${PUBKY_A}`, `foopubky${PUBKY_A}`, `pk:${PUBKY_A.slice(0, 51)}`]) {
      expect(splitMentions(text, labelFor)).toEqual([plain(text)]);
    }
  });
});

describe('truncateSegmentsByGraphemes', () => {
  it('returns the segments unchanged at or under the limit (no ellipsis)', () => {
    const segments = [plain('Hi '), mention('@Talos'), plain('!')];
    expect(truncateSegmentsByGraphemes(segments, 10)).toEqual(segments);
    expect(truncateSegmentsByGraphemes(segments, 20)).toEqual(segments);
  });

  it('cuts the run that crosses the limit and appends a plain ellipsis', () => {
    const segments = [plain('Hi '), mention('@Talos'), plain(' and friends')];
    expect(truncateSegmentsByGraphemes(segments, 6)).toEqual([plain('Hi '), mention('@Ta'), plain('...')]);
  });

  it('drops a run that starts past the limit instead of emitting an empty one', () => {
    const segments = [plain('Hi '), mention('@Talos'), plain(' and friends')];
    expect(truncateSegmentsByGraphemes(segments, 9)).toEqual([plain('Hi '), mention('@Talos'), plain('...')]);
  });

  it('counts emoji as single graphemes and never splits a ZWJ cluster', () => {
    expect(truncateSegmentsByGraphemes([plain('a👨‍👩‍👧'), mention('@x')], 1)).toEqual([plain('a'), plain('...')]);
  });

  it('flattens to exactly what truncateByGraphemes produces for the joined text', () => {
    const segments = [plain('Hey '), mention('@JeanlChristophe'), plain(' check out this Luffy tattoo! 🐸🐸')];
    for (const max of [0, 1, 4, 5, 12, 20, 30, 45, 100]) {
      expect(flatten(truncateSegmentsByGraphemes(segments, max))).toBe(truncateByGraphemes(flatten(segments), max));
    }
  });
});
