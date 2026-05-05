import { describe, expect, it } from 'vitest';
import { formatInviteCode } from './HumanInviteCode.utils';

describe('formatInviteCode', () => {
  it('returns empty string for empty input', () => {
    expect(formatInviteCode('')).toBe('');
  });

  it('converts lowercase to uppercase', () => {
    expect(formatInviteCode('abcd')).toBe('ABCD');
  });

  it('keeps uppercase as is', () => {
    expect(formatInviteCode('ABCD')).toBe('ABCD');
  });

  it('inserts dash after 4th character', () => {
    expect(formatInviteCode('abcde')).toBe('ABCD-E');
  });

  it('inserts second dash after 8th character', () => {
    expect(formatInviteCode('abcdefghi')).toBe('ABCD-EFGH-I');
  });

  it('formats complete 12-character code correctly', () => {
    expect(formatInviteCode('abcdefghijkl')).toBe('ABCD-EFGH-IJKL');
  });

  it('strips non-alphanumeric characters', () => {
    expect(formatInviteCode('a!@#b$%^c&*(d')).toBe('ABCD');
  });

  it('limits to 12 alphanumeric characters (14 with dashes)', () => {
    expect(formatInviteCode('abcdefghijklmnop')).toBe('ABCD-EFGH-IJKL');
  });

  it('handles pasted code with existing dashes', () => {
    expect(formatInviteCode('ABCD-EFGH-IJKL')).toBe('ABCD-EFGH-IJKL');
  });

  it('handles mixed case with special characters', () => {
    expect(formatInviteCode('N76q-G32n-C0rg')).toBe('N76Q-G32N-C0RG');
  });

  it('handles numbers correctly', () => {
    expect(formatInviteCode('1234567890AB')).toBe('1234-5678-90AB');
  });
});
