import { describe, expect, it } from 'vitest';
import type { MentionSegment } from '@/libs/post/postMentions';
import { prepareOgText, prepareOgTextSegments } from './ogText';

const plain = (text: string): MentionSegment => ({ text, isMention: false });
const mention = (text: string): MentionSegment => ({ text, isMention: true, pubky: 'x' });

describe('prepareOgText (emoji repair)', () => {
  it('returns text without a zero-width joiner unchanged', () => {
    expect(prepareOgText('Miguel Medeiros💯🌱🐸')).toBe('Miguel Medeiros💯🌱🐸');
    expect(prepareOgText('')).toBe('');
  });

  it('keeps valid, fully-qualified ZWJ sequences whole', () => {
    for (const sequence of ['👨‍👩‍👧', '🏳️‍🌈', '🧙‍♂️', '👩🏽‍💻']) {
      expect(prepareOgText(`a ${sequence} b`)).toBe(`a ${sequence} b`);
    }
  });

  it('fully qualifies an under-qualified sequence so the provider has an asset for it', () => {
    // Without VS16 these are not RGI, but their qualified forms are (and twemoji serves them).
    expect(prepareOgText('❤‍🔥')).toBe('❤️‍🔥');
    expect(prepareOgText('🏳‍🌈')).toBe('🏳️‍🌈');
    expect(prepareOgText('🧙‍♂')).toBe('🧙‍♂️');
  });

  it('splits a sequence that is not a valid emoji even when qualified, as browsers draw it', () => {
    // MAGE + ZWJ + TROLL (seen in a real display name) is not an RGI sequence.
    expect(prepareOgText('Miguel Medeiros💯🌱🐸🧙‍🧌')).toBe('Miguel Medeiros💯🌱🐸🧙🧌');
    expect(prepareOgText('🧙‍🧌 and 👨‍👩‍👧')).toBe('🧙🧌 and 👨‍👩‍👧');
  });

  it('leaves non-emoji clusters that use the joiner for text shaping untouched', () => {
    // Malayalam chillu (NA + VIRAMA + ZWJ), Sinhala yansaya, Devanagari half-form,
    // Arabic forced joining: the joiner is part of the spelling, not an emoji glue.
    for (const text of ['ന്‍', 'ක්‍ෂ', 'क्‍ख', 'ب‍ت']) {
      expect(prepareOgText(`name ${text}`)).toBe(`name ${text}`);
    }
  });

  it('truncates by graphemes after repairing when a limit is given', () => {
    // The split cluster counts as two graphemes, so the cut lands after the mage.
    expect(prepareOgText('a🧙‍🧌b', 2)).toBe('a🧙...');
    expect(prepareOgText('hello world', 5)).toBe('hello...');
  });
});

describe('prepareOgTextSegments', () => {
  it('repairs emoji in every run, then truncates', () => {
    const segments = [plain('by '), mention('@Miguel Medeiros💯🌱🐸🧙‍🧌'), plain(' 👋')];
    expect(prepareOgTextSegments(segments, 100)).toEqual([
      plain('by '),
      mention('@Miguel Medeiros💯🌱🐸🧙🧌'),
      plain(' 👋'),
    ]);
    expect(prepareOgTextSegments(segments, 5)).toEqual([plain('by '), mention('@M'), plain('...')]);
  });

  it('gives the same result as repairing before truncating when a repaired cluster straddles the cut', () => {
    // 'a' + split cluster (2 graphemes) + 'b': a cut at 2 keeps the mage only, whichever order applies.
    expect(prepareOgTextSegments([plain('a🧙‍🧌b')], 2)).toEqual([plain('a🧙'), plain('...')]);
    expect(prepareOgTextSegments([plain('a🧙‍🧌b')], 3)).toEqual([plain('a🧙🧌'), plain('...')]);
    expect(prepareOgTextSegments([plain('a🧙‍🧌b')], 4)).toEqual([plain('a🧙🧌b')]);
  });
});
