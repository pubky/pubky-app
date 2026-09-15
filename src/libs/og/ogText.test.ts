import { describe, expect, it } from 'vitest';
import type { MentionSegment } from '@/libs/post/postMentions';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import {
  prepareOgText,
  prepareOgTextSegments,
  splitUnsupportedEmojiSequences,
  truncateSegmentsByGraphemes,
} from './ogText';

const plain = (text: string): MentionSegment => ({ text, isMention: false });
const mention = (text: string): MentionSegment => ({ text, isMention: true });
const flatten = (segments: MentionSegment[]) => segments.map((segment) => segment.text).join('');

describe('splitUnsupportedEmojiSequences', () => {
  it('returns text without a zero-width joiner unchanged', () => {
    expect(splitUnsupportedEmojiSequences('Miguel Medeiros💯🌱🐸')).toBe('Miguel Medeiros💯🌱🐸');
    expect(splitUnsupportedEmojiSequences('')).toBe('');
  });

  it('keeps valid RGI ZWJ sequences whole', () => {
    for (const sequence of ['👨‍👩‍👧', '🏳️‍🌈', '🧙‍♂️', '👩🏽‍💻']) {
      expect(splitUnsupportedEmojiSequences(`a ${sequence} b`)).toBe(`a ${sequence} b`);
    }
  });

  it('splits an invalid ZWJ sequence into its component emoji, as browsers draw it', () => {
    // MAGE + ZWJ + TROLL (seen in a real display name) is not an RGI sequence.
    expect(splitUnsupportedEmojiSequences('Miguel Medeiros💯🌱🐸🧙‍🧌')).toBe('Miguel Medeiros💯🌱🐸🧙🧌');
  });

  it('handles valid and invalid sequences side by side', () => {
    expect(splitUnsupportedEmojiSequences('🧙‍🧌 and 👨‍👩‍👧')).toBe('🧙🧌 and 👨‍👩‍👧');
  });
});

describe('prepareOgText', () => {
  it('normalises emoji and leaves length alone without a limit', () => {
    expect(prepareOgText('hi 🧙‍🧌 there')).toBe('hi 🧙🧌 there');
  });

  it('normalises emoji before truncating by graphemes', () => {
    // The split cluster counts as two graphemes, so the cut lands after the mage.
    expect(prepareOgText('a🧙‍🧌b', 2)).toBe('a🧙...');
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

describe('prepareOgTextSegments', () => {
  it('normalises emoji in every run, then truncates', () => {
    const segments = [plain('by '), mention('@Miguel Medeiros💯🌱🐸🧙‍🧌'), plain(' 👋')];
    expect(prepareOgTextSegments(segments, 100)).toEqual([
      plain('by '),
      mention('@Miguel Medeiros💯🌱🐸🧙🧌'),
      plain(' 👋'),
    ]);
    expect(prepareOgTextSegments(segments, 5)).toEqual([plain('by '), mention('@M'), plain('...')]);
  });
});
