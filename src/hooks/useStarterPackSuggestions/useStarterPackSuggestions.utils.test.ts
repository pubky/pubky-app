import { describe, expect, it } from 'vitest';
import { STARTER_PACK_RESERVED_TAGS } from '@/config/nexus';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { resolveSuggestionsStreamId, selectMatchingTags } from './useStarterPackSuggestions.utils';

describe('resolveSuggestionsStreamId', () => {
  it('falls back to most active users this month when no interests were chosen', () => {
    expect(resolveSuggestionsStreamId([])).toBe(UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL);
    expect(UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL).toBe('influencers:this_month:all');
  });

  it('builds the tag-aware starter pack stream preserving order', () => {
    expect(resolveSuggestionsStreamId(['travel', 'music'])).toBe('starter_pack:all:all:travel,music');
    expect(resolveSuggestionsStreamId(['music', 'travel'])).toBe('starter_pack:all:all:music,travel');
  });

  it('falls back instead of throwing when the persisted seed is invalid', () => {
    expect(resolveSuggestionsStreamId([STARTER_PACK_RESERVED_TAGS[0]])).toBe(
      UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL,
    );
    expect(resolveSuggestionsStreamId(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL);
  });
});

describe('selectMatchingTags', () => {
  const interests = ['bitcoin', 'music', 'travel'];

  it('returns only profile tags that intersect the chosen interests, in profile order', () => {
    expect(selectMatchingTags(['developer', 'travel', 'bitcoin'], interests)).toEqual(['travel', 'bitcoin']);
  });

  it('caps the result at the configured maximum', () => {
    expect(selectMatchingTags(['bitcoin', 'music', 'travel'], interests)).toEqual(['bitcoin', 'music']);
    expect(selectMatchingTags(['bitcoin', 'music', 'travel'], interests, 1)).toEqual(['bitcoin']);
  });

  it('matches canonically and dedupes', () => {
    expect(selectMatchingTags([' Bitcoin ', 'BITCOIN', 'Music'], interests)).toEqual(['bitcoin', 'music']);
  });

  it('returns nothing when there is no intersection', () => {
    expect(selectMatchingTags(['developer', 'founder'], interests)).toEqual([]);
  });

  it('returns nothing without profile tags or without interests', () => {
    expect(selectMatchingTags(undefined, interests)).toEqual([]);
    expect(selectMatchingTags([], interests)).toEqual([]);
    expect(selectMatchingTags(['bitcoin'], [])).toEqual([]);
  });
});
