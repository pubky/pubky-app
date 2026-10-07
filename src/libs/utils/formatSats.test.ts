import { describe, expect, it } from 'vitest';
import { formatSats } from './formatSats';

describe('formatSats', () => {
  describe('amount formatting', () => {
    it.each([
      { amount: 0, expected: '₿0', case: 'zero' },
      { amount: 1, expected: '₿1', case: 'one sat' },
      { amount: 999, expected: '₿999', case: 'below the first grouping boundary' },
      { amount: 1_000, expected: '₿1,000', case: 'at the first grouping boundary' },
      { amount: 1_234_567_890, expected: '₿1,234,567,890', case: 'multiple groups' },
      {
        amount: Number.MAX_SAFE_INTEGER,
        expected: '₿9,007,199,254,740,991',
        case: 'the largest precisely representable integer',
      },
    ])('formats $case', ({ amount, expected }) => {
      expect(formatSats(amount)).toBe(expected);
    });

    it.each([
      ['0', '₿0'],
      ['1000', '₿1,000'],
      ['1234567890', '₿1,234,567,890'],
      [String(Number.MAX_SAFE_INTEGER), '₿9,007,199,254,740,991'],
    ])('formats numeric string %s', (amount, expected) => {
      expect(formatSats(amount)).toBe(expected);
    });
  });

  describe('symbol presentation', () => {
    it('places the symbol directly before the amount by default', () => {
      expect(formatSats(1_000)).toBe('₿1,000');
    });

    it('adds one space after the symbol when requested', () => {
      expect(formatSats(1_000, { space: true })).toBe('₿ 1,000');
    });

    it('omits the symbol without changing the grouped amount', () => {
      expect(formatSats(1_000, { symbol: false })).toBe('1,000');
    });

    it('ignores symbol spacing when the symbol is omitted', () => {
      expect(formatSats(1_000, { symbol: false, space: true })).toBe('1,000');
    });
  });

  describe('invalid amounts', () => {
    it.each([
      { amount: '', case: 'an empty string' },
      { amount: ' ', case: 'whitespace' },
      { amount: 'one thousand', case: 'non-numeric text' },
      { amount: '1,000', case: 'a pre-formatted string' },
      { amount: ' 1000', case: 'leading whitespace' },
      { amount: '1000 ', case: 'trailing whitespace' },
      { amount: '+1000', case: 'an explicit positive sign' },
      { amount: '0001000', case: 'a non-canonical integer string' },
      { amount: '1.5', case: 'a fractional string' },
      { amount: '1e3', case: 'exponential notation' },
      { amount: '-1', case: 'a negative string' },
      { amount: -1, case: 'a negative number' },
      { amount: 1.5, case: 'a fractional number' },
      { amount: Number.NaN, case: 'NaN' },
      { amount: Number.POSITIVE_INFINITY, case: 'positive infinity' },
      { amount: Number.NEGATIVE_INFINITY, case: 'negative infinity' },
      { amount: Number.MAX_SAFE_INTEGER + 1, case: 'an unsafe number' },
      { amount: '9007199254740992', case: 'a numeric string above the safe range' },
    ])('returns null for $case', ({ amount }) => {
      expect(formatSats(amount)).toBeNull();
    });

    it('returns null before applying presentation options', () => {
      expect(formatSats('invalid', { symbol: false, space: true })).toBeNull();
    });
  });
});
