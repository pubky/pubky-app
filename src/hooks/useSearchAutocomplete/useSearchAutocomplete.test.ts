import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useSearchAutocomplete } from './useSearchAutocomplete';
import { AUTOCOMPLETE_DEBOUNCE_MS } from './useSearchAutocomplete.constants';

// Hoist mock data
const {
  mockUserDetailsMap,
  setMockUserDetailsMap,
  mockGetTagsByPrefix,
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
    mockGetTagsByPrefix: vi.fn(),
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
    getTagsByPrefix: (...args: unknown[]) => mockGetTagsByPrefix(...args),
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

// Mock lodash-es debounce
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => {
    const debouncedFn = vi.fn(fn);
    debouncedFn.cancel = vi.fn();
    return debouncedFn;
  }),
}));

describe('useSearchAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetTagsByPrefix.mockResolvedValue(['tech', 'technology', 'techno']);
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

  it('fetches tags and users after debounce', async () => {
    const { result, rerender } = renderHook(() => useSearchAutocomplete({ query: 'tech' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    expect(mockGetTagsByPrefix).toHaveBeenCalledWith({ prefix: 'tech', limit: 3 });
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'tech', limit: 10 });
    // Should also search by user ID for non-prefixed queries
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'tech', limit: 10 });
    expect(result.current.tags).toEqual([{ name: 'tech' }, { name: 'technology' }, { name: 'techno' }]);
    expect(result.current.users).toEqual([
      { id: 'pk:user1', name: 'User One', avatarUrl: 'https://example.com/pk:user1/avatar' },
      { id: 'pk:user2', name: 'User Two' },
    ]);
  });

  it('searches by user ID when query starts with pk:', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pk:abc' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc', limit: 10 });
    // Should not search by name or tags when doing explicit ID search with prefix
    expect(mockGetUsersByName).not.toHaveBeenCalled();
    expect(mockGetTagsByPrefix).not.toHaveBeenCalled();
  });

  it('searches by user ID AND name AND tags for non-prefixed queries', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'abc123' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Should search by ID (using the raw query as prefix)
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc123', limit: 10 });
    // Should also search by name and tags
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: 'abc123', limit: 10 });
    expect(mockGetTagsByPrefix).toHaveBeenCalledWith({ prefix: 'abc123', limit: 3 });
  });

  it('does not search by ID if prefix is too short', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pk:ab' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('deduplicates user results from ID and name searches', async () => {
    // Both searches return pk:user1, demonstrating deduplication
    mockGetUsersByName.mockResolvedValue(['pk:user1', 'pk:user2']);
    mockFetchUsersById.mockResolvedValue(['pk:user1', 'pk:user3']);

    const { result, rerender } = renderHook(() => useSearchAutocomplete({ query: 'test' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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
    mockGetTagsByPrefix.mockRejectedValue(new Error('API Error'));
    mockGetUsersByName.mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useSearchAutocomplete({ query: 'tech' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Should have searched with 'test'
    expect(mockGetTagsByPrefix).toHaveBeenLastCalledWith({ prefix: 'test', limit: 3 });
  });

  it('trims whitespace from query', async () => {
    renderHook(() => useSearchAutocomplete({ query: '  tech  ' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetTagsByPrefix).toHaveBeenCalledWith({ prefix: 'tech', limit: 3 });
  });

  it('searches by user ID when query starts with pubky: (with colon)', async () => {
    renderHook(() => useSearchAutocomplete({ query: 'pubky:abc123' }));

    // Fast-forward past debounce and run all pending timers
    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Should strip the 'pubky:' prefix (including colon) and search with just the z32 part
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: 'abc123', limit: 10 });
    // Should not search by name or tags when doing explicit ID search with prefix
    expect(mockGetUsersByName).not.toHaveBeenCalled();
    expect(mockGetTagsByPrefix).not.toHaveBeenCalled();
  });

  it('skips tag search when query exceeds TAG_MAX_LENGTH', async () => {
    const longQuery = 'a'.repeat(21);
    renderHook(() => useSearchAutocomplete({ query: longQuery }));

    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetTagsByPrefix).not.toHaveBeenCalled();
    // User searches should still proceed
    expect(mockGetUsersByName).toHaveBeenCalledWith({ prefix: longQuery, limit: 10 });
    expect(mockFetchUsersById).toHaveBeenCalledWith({ prefix: longQuery, limit: 10 });
  });

  it('searches tags when query is exactly TAG_MAX_LENGTH', async () => {
    const exactQuery = 'a'.repeat(20);
    renderHook(() => useSearchAutocomplete({ query: exactQuery }));

    await act(async () => {
      vi.advanceTimersByTime(AUTOCOMPLETE_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetTagsByPrefix).toHaveBeenCalledWith({ prefix: exactQuery, limit: 3 });
  });
});
