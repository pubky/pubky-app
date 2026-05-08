import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { useEnrichedTags } from './useEnrichedTags';

// Mock useBulkUserAvatars
const mockUsersMap = new Map();
const mockIsLoading = { value: false };

vi.mock('../useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: () => ({
    usersMap: mockUsersMap,
    isLoading: mockIsLoading.value,
  }),
}));

describe('useEnrichedTags', () => {
  beforeEach(() => {
    mockUsersMap.clear();
    mockIsLoading.value = false;
  });

  it('should return empty array when given empty tags', () => {
    const { result } = renderHook(() => useEnrichedTags([]));

    expect(result.current.enrichedTags).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should enrich tags with user details from usersMap', () => {
    const taggerId1 = 'pk1tagger1';
    const taggerId2 = 'pk1tagger2';

    const tags: TagWithAvatars[] = [
      {
        label: 'music',
        taggers_count: 2,
        relationship: false,
        taggers: [
          { id: taggerId1, name: undefined, avatarUrl: undefined },
          { id: taggerId2, name: undefined, avatarUrl: undefined },
        ],
      },
    ];

    // Set up mock user details
    mockUsersMap.set(taggerId1, { id: taggerId1, name: 'Alice', avatarUrl: 'https://cdn.example.com/alice.jpg' });
    mockUsersMap.set(taggerId2, { id: taggerId2, name: 'Bob', avatarUrl: 'https://cdn.example.com/bob.jpg' });

    const { result } = renderHook(() => useEnrichedTags(tags));

    expect(result.current.enrichedTags).toHaveLength(1);
    expect(result.current.enrichedTags[0].taggers).toHaveLength(2);

    // Verify tagger 1 was enriched
    expect(result.current.enrichedTags[0].taggers[0]).toEqual({
      id: taggerId1,
      name: 'Alice',
      avatarUrl: 'https://cdn.example.com/alice.jpg',
    });

    // Verify tagger 2 was enriched
    expect(result.current.enrichedTags[0].taggers[1]).toEqual({
      id: taggerId2,
      name: 'Bob',
      avatarUrl: 'https://cdn.example.com/bob.jpg',
    });
  });

  it('should fallback to original tagger name when user not found in map', () => {
    const taggerId = 'pk1unknown';

    const tags: TagWithAvatars[] = [
      {
        label: 'art',
        taggers_count: 1,
        relationship: false,
        taggers: [{ id: taggerId, name: 'Original Name', avatarUrl: undefined }],
      },
    ];

    // usersMap is empty - user not found

    const { result } = renderHook(() => useEnrichedTags(tags));

    expect(result.current.enrichedTags[0].taggers[0].name).toBe('Original Name');
    expect(result.current.enrichedTags[0].taggers[0].avatarUrl).toBeUndefined();
  });

  it('should preserve original avatarUrl while loading', () => {
    const taggerId = 'pk1tagger1';
    const originalAvatarUrl = 'https://cdn.example.com/original.jpg';

    const tags: TagWithAvatars[] = [
      {
        label: 'photo',
        taggers_count: 1,
        relationship: false,
        taggers: [{ id: taggerId, name: 'Tagger', avatarUrl: originalAvatarUrl }],
      },
    ];

    // Simulate loading state
    mockIsLoading.value = true;

    const { result } = renderHook(() => useEnrichedTags(tags));

    // During loading, original avatarUrl should be preserved (prevents flash)
    expect(result.current.enrichedTags[0].taggers[0].avatarUrl).toBe(originalAvatarUrl);
    expect(result.current.isLoading).toBe(true);
  });

  it('should use verified avatarUrl after loading completes', () => {
    const taggerId = 'pk1tagger1';
    const originalAvatarUrl = 'https://cdn.example.com/original.jpg';
    const verifiedAvatarUrl = 'https://cdn.example.com/verified.jpg';

    const tags: TagWithAvatars[] = [
      {
        label: 'photo',
        taggers_count: 1,
        relationship: false,
        taggers: [{ id: taggerId, name: 'Tagger', avatarUrl: originalAvatarUrl }],
      },
    ];

    // Loading complete, user has different avatar
    mockIsLoading.value = false;
    mockUsersMap.set(taggerId, { id: taggerId, name: 'Verified Name', avatarUrl: verifiedAvatarUrl });

    const { result } = renderHook(() => useEnrichedTags(tags));

    // After loading, should use verified avatarUrl from usersMap
    expect(result.current.enrichedTags[0].taggers[0].avatarUrl).toBe(verifiedAvatarUrl);
    expect(result.current.enrichedTags[0].taggers[0].name).toBe('Verified Name');
  });

  it('should set avatarUrl to undefined when user has no avatar after loading', () => {
    const taggerId = 'pk1tagger1';
    const originalAvatarUrl = 'https://cdn.example.com/original.jpg';

    const tags: TagWithAvatars[] = [
      {
        label: 'photo',
        taggers_count: 1,
        relationship: false,
        taggers: [{ id: taggerId, name: 'Tagger', avatarUrl: originalAvatarUrl }],
      },
    ];

    // Loading complete, user has no avatar
    mockIsLoading.value = false;
    mockUsersMap.set(taggerId, { id: taggerId, name: 'No Avatar User', avatarUrl: undefined });

    const { result } = renderHook(() => useEnrichedTags(tags));

    // After loading, should use undefined (user has no avatar)
    expect(result.current.enrichedTags[0].taggers[0].avatarUrl).toBeUndefined();
    expect(result.current.enrichedTags[0].taggers[0].name).toBe('No Avatar User');
  });

  it('should handle multiple tags with shared taggers', () => {
    const sharedTaggerId = 'pk1shared';

    const tags: TagWithAvatars[] = [
      {
        label: 'tag1',
        taggers_count: 1,
        relationship: false,
        taggers: [{ id: sharedTaggerId, name: undefined, avatarUrl: undefined }],
      },
      {
        label: 'tag2',
        taggers_count: 1,
        relationship: true,
        taggers: [{ id: sharedTaggerId, name: undefined, avatarUrl: undefined }],
      },
    ];

    mockUsersMap.set(sharedTaggerId, {
      id: sharedTaggerId,
      name: 'Shared User',
      avatarUrl: 'https://cdn.example.com/shared.jpg',
    });

    const { result } = renderHook(() => useEnrichedTags(tags));

    // Both tags should have the same enriched tagger
    expect(result.current.enrichedTags[0].taggers[0].name).toBe('Shared User');
    expect(result.current.enrichedTags[1].taggers[0].name).toBe('Shared User');
  });

  it('should preserve other tag properties during enrichment', () => {
    const taggerId = 'pk1tagger';

    const tags: TagWithAvatars[] = [
      {
        label: 'special-tag',
        taggers_count: 5,
        relationship: true,
        taggers: [{ id: taggerId, name: undefined, avatarUrl: undefined }],
      },
    ];

    mockUsersMap.set(taggerId, { id: taggerId, name: 'User', avatarUrl: 'https://cdn.example.com/user.jpg' });

    const { result } = renderHook(() => useEnrichedTags(tags));

    // Tag properties should be preserved
    expect(result.current.enrichedTags[0].label).toBe('special-tag');
    expect(result.current.enrichedTags[0].taggers_count).toBe(5);
    expect(result.current.enrichedTags[0].relationship).toBe(true);
  });
});
