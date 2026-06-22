import { describe, expect, it } from 'vitest';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { resolveSearchAutocompletePlan } from './useSearchAutocomplete.utils';

describe('resolveSearchAutocompletePlan', () => {
  it.each([
    {
      query: '',
      expected: { tagPrefix: null, userNamePrefix: null, userIdPrefix: null },
    },
    {
      query: 'p',
      expected: { tagPrefix: 'p', userNamePrefix: 'p', userIdPrefix: null },
    },
    {
      query: 'pu',
      expected: { tagPrefix: 'pu', userNamePrefix: 'pu', userIdPrefix: null },
    },
    {
      query: 'pub',
      expected: { tagPrefix: 'pub', userNamePrefix: 'pub', userIdPrefix: null },
    },
    {
      query: 'pubk',
      expected: { tagPrefix: 'pubk', userNamePrefix: 'pubk', userIdPrefix: null },
    },
    {
      query: 'pubky',
      expected: { tagPrefix: 'pubky', userNamePrefix: 'pubky', userIdPrefix: null },
    },
    {
      query: 'pubky-fee',
      expected: { tagPrefix: 'pubky-fee', userNamePrefix: 'pubky-fee', userIdPrefix: null },
    },
    {
      query: 'pubkyab',
      expected: { tagPrefix: 'pubkyab', userNamePrefix: 'pubkyab', userIdPrefix: null },
    },
    {
      query: 'pubkyabc',
      expected: { tagPrefix: 'pubkyabc', userNamePrefix: 'pubkyabc', userIdPrefix: 'abc' },
    },
    {
      query: 'pubkyABC',
      expected: { tagPrefix: 'pubkyABC', userNamePrefix: 'pubkyABC', userIdPrefix: 'ABC' },
    },
    {
      query: 'PUBKYIH4',
      expected: { tagPrefix: 'PUBKYIH4', userNamePrefix: 'PUBKYIH4', userIdPrefix: 'IH4' },
    },
    {
      query: 'PUBKY',
      expected: { tagPrefix: 'PUBKY', userNamePrefix: 'PUBKY', userIdPrefix: null },
    },
    {
      query: 'PUB',
      expected: { tagPrefix: 'PUB', userNamePrefix: 'PUB', userIdPrefix: null },
    },
    {
      query: 'ab',
      expected: { tagPrefix: 'ab', userNamePrefix: 'ab', userIdPrefix: null },
    },
    {
      query: 'abc',
      expected: { tagPrefix: 'abc', userNamePrefix: 'abc', userIdPrefix: 'abc' },
    },
    {
      query: 'abc123',
      expected: { tagPrefix: 'abc123', userNamePrefix: 'abc123', userIdPrefix: 'abc123' },
    },
    {
      query: 'ABC123',
      expected: { tagPrefix: 'ABC123', userNamePrefix: 'ABC123', userIdPrefix: 'ABC123' },
    },
    {
      query: 'IH4',
      expected: { tagPrefix: 'IH4', userNamePrefix: 'IH4', userIdPrefix: 'IH4' },
    },
    {
      query: 'abc-123',
      expected: { tagPrefix: 'abc-123', userNamePrefix: 'abc-123', userIdPrefix: null },
    },
    {
      query: 'pk:abc',
      expected: { tagPrefix: null, userNamePrefix: null, userIdPrefix: 'abc' },
    },
    {
      query: 'pubky:abc',
      expected: { tagPrefix: null, userNamePrefix: null, userIdPrefix: 'abc' },
    },
    {
      query: 'PK:IH4',
      expected: { tagPrefix: null, userNamePrefix: null, userIdPrefix: 'IH4' },
    },
    {
      query: 'PUBKY:IH4',
      expected: { tagPrefix: null, userNamePrefix: null, userIdPrefix: 'IH4' },
    },
    {
      query: 'pk:ab',
      expected: { tagPrefix: null, userNamePrefix: null, userIdPrefix: null },
    },
  ])('resolves endpoint prefixes for "$query"', ({ query, expected }) => {
    expect(resolveSearchAutocompletePlan(query)).toEqual(expected);
  });

  it('preserves user searches while skipping tags over the tag length limit', () => {
    const query = 'a'.repeat(TAG_MAX_LENGTH + 1);

    expect(resolveSearchAutocompletePlan(query)).toEqual({
      tagPrefix: null,
      userNamePrefix: query,
      userIdPrefix: query,
    });
  });
});
