import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useSearchAutocomplete } from './useSearchAutocomplete';
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  AUTOCOMPLETE_TAG_LIMIT,
  AUTOCOMPLETE_USER_LIMIT,
} from './useSearchAutocomplete.constants';

// Hoist mock data
const {
  mockUserDetailsMap,
  setMockUserDetailsMap,
  mockFetchTagsByPrefix,
  mockGetUsersByName,
  mockFetchUsersById,
  mockGetManyDetails,
  mockGetOrFetchDetails,
  mockGetAvatarUrl,
} = vi.hoisted(() => {
  const userDetailsMap = { current: new Map<Pubky, NexusUserDetails>() };
  return {
    mockUserDetailsMap: userDetailsMap,
    setMockUserDetailsMap: (value: Map<Pubky, NexusUserDetails>) => {
      userDetailsMap.current = value;
    },
    mockFetchTagsByPrefix: vi.fn(),
    mockGetUsersByName: vi.fn(),
    mockFetchUsersById: vi.fn(),
    mockGetManyDetails: vi.fn(),
    mockGetOrFetchDetails: vi.fn(),
    mockGetAvatarUrl: vi.fn(),
  };
});

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn, _deps, _defaultValue) => {
    // Execute the query function to trigger it
    if (queryFn) {
      void queryFn();
    }
    return mockUserDetailsMap.current;
  }),
}));

// Mock dependencies
vi.mock('@/controllers/search/search', () => ({
  SearchController: {
    fetchTagsByPrefix: (...args: unknown[]) => mockFetchTagsByPrefix(...args),
    getUsersByName: (...args: unknown[]) => mockGetUsersByName(...args),
    fetchUsersById: (...args: unknown[]) => mockFetchUsersById(...args),
  },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyDetails: (...args: unknown[]) => mockGetManyDetails(...args),
    getOrFetchDetails: (...args: unknown[]) => mockGetOrFetchDetails(...args),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: (...args: unknown[]) => mockGetAvatarUrl(...args),
  },
}));

// Timer-based debounce fake (works with fake timers) so the debounce window is
// observable: loading must be on during the window, before any fetch fires.
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn: (...args: unknown[]) => unknown, wait: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Object.assign(
      vi.fn((...args: unknown[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => void fn(...args), wait);
      }),
      { cancel: vi.fn(() => clearTimeout(timer)) },
    );
  }),
}));

async function flushAutocompleteSearch() {
  await act(async () => {
    vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
    await vi.runOnlyPendingTimersAsync();
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useSearchAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchTagsByPrefix.mockResolvedValue(['tech', 'technology', 'techno']);
    mockGetUsersByName.mockResolvedValue(['pk:user1', 'pk:user2']);
    mockFetchUsersById.mockResolvedValue(['pk:abc123']);
    mockGetManyDetails.mockImplementation(({ userIds }: { userIds: Pubky[] }) => {
      const map = new Map<Pubky, NexusUserDetails>();
      for (const userId of userIds) {
        if (userId === 'pk:user1') {
          map.set(userId, { id: 'pk:user1', name: 'User One', image: 'avatar1.jpg' } as NexusUserDetails);
        } else if (userId === 'pk:user2') {
          map.set(userId, { id: 'pk:user2', name: 'User Two', image: null } as NexusUserDetails);
        } else if (userId === 'pk:user3') {
          map.set(userId, { id: 'pk:user3', name: 'User Three', image: null } as NexusUserDetails);
        } else if (userId === 'pk:abc123') {
          map.set(userId, { id: 'pk:abc123', name: 'ABC User', image: 'avatar2.jpg' } as NexusUserDetails);
        }
      }
      return Promise.resolve(map);
    });
    mockGetOrFetchDetails.mockImplementation(({ userId }: { userId: string }) => {
      if (userId === 'pk:user1') {
        return Promise.resolve({ id: 'pk:user1', name: 'User One', image: 'avatar1.jpg' });
      }
      if (userId === 'pk:user2') {
        return Promise.resolve({ id: 'pk:user2', name: 'User Two', image: null });
      }
      if (userId === 'pk:user3') {
        return Promise.resolve({ id: 'pk:user3', name: 'User Three', image: null });
      }
      if (userId === 'pk:abc123') {
        return Promise.resolve({ id: 'pk:abc123', name: 'ABC User', image: 'avatar2.jpg' });
      }
      return Promise.resolve(null);
    });
    mockGetAvatarUrl.mockImplementation((id: string) => `https://example.com/${id}/avatar`);
    setMockUserDetailsMap(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns empty arrays initially', () => {
    const { result } = renderHook(() => useSearchAutocomplete({ query: '' }));

    expect(result.current.tags).toEqual([]);
    expect(result.current.users).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty arrays when disabled', () => {
    const { result } = renderHook(() => useSearchAutocomplete({ query: 'tech', enabled: false }));

    expect(result.current.tags).toEqual([]);
    expect(result.current.users).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('sets loading state when query is provided', async () => {
    const { result } = renderHook(() => useSearchAutocomplete({ query: 'tech' }));

    expect(result.current.isLoading).toBe(true);
  });

  it('keeps loading through the debounce window until the response settles', async () => {
    mockGetUsersByName.mockResolvedValue([]);
    mockFetchUsersById.mockResolvedValue([]);
    const { result } = renderHook(() => useSearchAutocomplete({ query: 'tech' }));

    // Debounce window: nothing fetched yet, but loading is already reported.
    expect(result.current.isLoading).toBe(true);
    expect(mockFetchTagsByPrefix).not.toHaveBeenCalled();

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches tags and users after debounce', async () => {
    const { result, rerender } = renderHook(() => useSearchAutocomplete({ query: 'tech' }));

    await flushAutocompleteSearch();

    // Set mock user details map to simulate useLiveQuery returning data
    const userDetailsMap = new Map<Pubky, NexusUserDetails>();
    userDetailsMap.set('pk:user1', { id: 'pk:user1', name: 'User One', image: 'avatar1.jpg' } as NexusUserDetails);
    userDetailsMap.set('pk:user2', { id: 'pk:user2', name: 'User Two', image: null } as NexusUserDetails);
    setMockUserDetailsMap(userDetailsMap);

    // Re-render to trigger useLiveQuery update
    await act(async () => {
      rerender({ query: 'tech' });
      await Promise.resolve();
    });

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'tech', limit: AUTOCOMPLETE_TAG_LIMIT });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'tech', limit: AUTOCOMPLETE_USER_LIMIT });
    // Should also search by user ID for non-prefixed queries
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'tech', limit: AUTOCOMPLETE_USER_LIMIT });
    expect(result.current.tags).toEqual([{ name: 'tech' }, { name: 'technology' }, { name: 'techno' }]);
    expect(result.current.users).toEqual([
      { id: 'pk:user1', name: 'User One', avatarUrl: 'https://example.com/pk:user1/avatar' },
      { id: 'pk:user2', name: 'User Two' },
    ]);
  });

  it('searches by user ID when query starts with pk:', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pk:abc' }));

    await flushAutocompleteSearch();

    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc', limit: AUTOCOMPLETE_USER_LIMIT });
    // Should not search by name or tags when doing explicit ID search with prefix
    expect(mockGetUsersByName).not.toHaveBeenCalled();
    expect(mockFetchTagsByPrefix).not.toHaveBeenCalled();
  });

  it.each(['p', 'pu', 'pub', 'pubk', 'pubky'])('searches tags and usernames but not user IDs for %s', async (query) => {
    renderHook(() => useSearchAutocomplete({ query }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: query, limit: AUTOCOMPLETE_TAG_LIMIT });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: query, limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('keeps compact pubky tag text intact and skips the invalid user ID search', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pubky-feedback' }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'pubky-feedback', limit: AUTOCOMPLETE_TAG_LIMIT });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'pubky-feedback', limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('searches compact pubky text by tag and name while stripping only the user ID prefix', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pubkyabc' }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'pubkyabc', limit: AUTOCOMPLETE_TAG_LIMIT });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'pubkyabc', limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc', limit: AUTOCOMPLETE_USER_LIMIT });
  });

  it('preserves uppercase raw text while searching user IDs case-insensitively', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'IH4' }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'IH4', limit: AUTOCOMPLETE_TAG_LIMIT });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'IH4', limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'IH4', limit: AUTOCOMPLETE_USER_LIMIT });
  });

  it('recognizes a mixed-case compact prefix without changing endpoint query casing', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pubkyIH4' }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'pubkyIH4', limit: AUTOCOMPLETE_TAG_LIMIT });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'pubkyIH4', limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'IH4', limit: AUTOCOMPLETE_USER_LIMIT });
  });

  it('searches by user ID AND name AND tags for non-prefixed queries', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'abc123' }));

    await flushAutocompleteSearch();

    // Should search by ID (using the raw query as prefix)
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc123', limit: AUTOCOMPLETE_USER_LIMIT });
    // Should also search by name and tags
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'abc123', limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'abc123', limit: AUTOCOMPLETE_TAG_LIMIT });
  });

  it('does not search by ID if prefix is too short', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pk:ab' }));

    await flushAutocompleteSearch();

    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('deduplicates user results from ID and name searches', async () => {
    // Both searches return pk:user1, demonstrating deduplication
    mockGetUsersByName.mockResolvedValue(['pk:user1', 'pk:user2']);
    mockFetchUsersById.mockResolvedValue(['pk:user1', 'pk:user3']);

    const { result, rerender } = renderHook(() => useSearchAutocomplete({ query: 'test' }));

    await flushAutocompleteSearch();

    // Set mock user details map for all users (including user3 from ID search)
    const userDetailsMap = new Map<Pubky, NexusUserDetails>();
    userDetailsMap.set('pk:user1', { id: 'pk:user1', name: 'User One', image: null } as NexusUserDetails);
    userDetailsMap.set('pk:user2', { id: 'pk:user2', name: 'User Two', image: null } as NexusUserDetails);
    userDetailsMap.set('pk:user3', { id: 'pk:user3', name: 'User Three', image: null } as NexusUserDetails);
    setMockUserDetailsMap(userDetailsMap);

    // Re-render to trigger useLiveQuery update
    await act(async () => {
      rerender({ query: 'test' });
      await Promise.resolve();
    });

    // Should have all 3 users (pk:user1 deduplicated, appearing only once)
    const userIds = result.current.users.map((u) => u.id);
    expect(userIds).toContain('pk:user1');
    expect(userIds).toContain('pk:user2');
    expect(userIds).toContain('pk:user3');
    // Verify no duplicates
    expect(userIds.filter((id) => id === 'pk:user1').length).toBe(1);
  });

  it('returns empty arrays on API error', async () => {
    mockFetchTagsByPrefix.mockRejectedValue(new Error('API Error'));
    mockGetUsersByName.mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useSearchAutocomplete({ query: 'tech' }));

    await flushAutocompleteSearch();

    expect(result.current.tags).toEqual([]);
    expect(result.current.users).toEqual([]);
  });

  it('performs new search when query changes', async () => {
    const { rerender } = renderHook(({ query }) => useSearchAutocomplete({ query }), {
      initialProps: { query: 'tech' },
    });

    // Advance a bit but not past debounce
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Change query
    rerender({ query: 'test' });

    await flushAutocompleteSearch();

    // Should have searched with 'test'
    expect(mockFetchTagsByPrefix).toHaveBeenLastCalledWith({ prefix: 'test', limit: AUTOCOMPLETE_TAG_LIMIT });
  });

  it('trims whitespace from query', async () => {
    renderHook(() => useSearchAutocomplete({ query: '  tech  ' }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'tech', limit: AUTOCOMPLETE_TAG_LIMIT });
  });

  it('searches by user ID when query starts with pubky: (with colon)', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pubky:abc123' }));

    await flushAutocompleteSearch();

    // Should strip the 'pubky:' prefix (including colon) and search with just the z32 part
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc123', limit: AUTOCOMPLETE_USER_LIMIT });
    // Should not search by name or tags when doing explicit ID search with prefix
    expect(mockGetUsersByName).not.toHaveBeenCalled();
    expect(mockFetchTagsByPrefix).not.toHaveBeenCalled();
  });

  it('skips tag search when query exceeds TAG_MAX_LENGTH', async () => {
    const longQuery = 'a'.repeat(21);
    renderHook(() => useSearchAutocomplete({ query: longQuery }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).not.toHaveBeenCalled();
    // User searches should still proceed
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: longQuery, limit: AUTOCOMPLETE_USER_LIMIT });
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: longQuery, limit: AUTOCOMPLETE_USER_LIMIT });
  });

  it('searches tags when query is exactly TAG_MAX_LENGTH', async () => {
    const exactQuery = 'a'.repeat(20);
    renderHook(() => useSearchAutocomplete({ query: exactQuery }));

    await flushAutocompleteSearch();

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: exactQuery, limit: AUTOCOMPLETE_TAG_LIMIT });
  });
});
