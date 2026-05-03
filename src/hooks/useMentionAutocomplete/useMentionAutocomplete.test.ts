import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockKeyboardEvent } from '@/test-utils/react-events';
import { useMentionAutocomplete } from './useMentionAutocomplete';
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
// Hoist mock data
const {
  mockUserDetailsMap,
  setMockUserDetailsMap,
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
    if (queryFn) {
      void queryFn();
    }
    return mockUserDetailsMap.current;
  }),
}));

// Mock dependencies
vi.mock('@/controllers/search/search', () => ({
  SearchController: {
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

// Mock lodash-es debounce to execute immediately
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => {
    const debouncedFn = vi.fn(fn);
    debouncedFn.cancel = vi.fn();
    return debouncedFn;
  }),
}));

describe('useMentionAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetUsersByName.mockResolvedValue(['user1', 'user2']);
    mockFetchUsersById.mockResolvedValue(['abc123']);
    mockGetManyDetails.mockImplementation(({ userIds }: { userIds: Pubky[] }) => {
      const map = new Map<Pubky, NexusUserDetails>();
      for (const userId of userIds) {
        if (userId === 'user1') {
          map.set(userId, { id: 'user1', name: 'User One', image: 'avatar1.jpg' } as NexusUserDetails);
        } else if (userId === 'user2') {
          map.set(userId, { id: 'user2', name: 'User Two', image: null } as NexusUserDetails);
        } else if (userId === 'abc123') {
          map.set(userId, { id: 'abc123', name: 'ABC User', image: 'avatar2.jpg' } as NexusUserDetails);
        }
      }
      return Promise.resolve(map);
    });
    mockGetOrFetchDetails.mockResolvedValue(null);
    mockGetAvatarUrl.mockImplementation((id: string) => `https://example.com/${id}/avatar`);
    setMockUserDetailsMap(new Map());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns initial state when content is empty', () => {
    const { result } = renderHook(() => useMentionAutocomplete({ content: '' }));

    expect(result.current.users).toEqual([]);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedIndex).toBeNull();
  });

  it('returns initial state when content has no mention pattern', () => {
    const { result } = renderHook(() => useMentionAutocomplete({ content: 'Hello world' }));

    expect(result.current.users).toEqual([]);
    expect(result.current.isOpen).toBe(false);
  });

  it('triggers search when @ pattern is detected at end of content', async () => {
    renderHook(() => useMentionAutocomplete({ content: 'Hello @jo' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGetUsersByName).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: 'jo',
      }),
    );
  });

  it('triggers search when pk: pattern is detected at end of content (legacy)', async () => {
    renderHook(() => useMentionAutocomplete({ content: 'Hello pk:abc' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockFetchUsersById).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: 'abc',
      }),
    );
  });

  it('triggers search when pubky pattern is detected at end of content (new format)', async () => {
    renderHook(() => useMentionAutocomplete({ content: 'Hello pubkyabc' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockFetchUsersById).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: 'abc',
      }),
    );
  });

  it('does not search when @ query is too short', async () => {
    renderHook(() => useMentionAutocomplete({ content: 'Hello @j' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should not be called because 'j' is only 1 character (min is 2)
    expect(mockGetUsersByName).not.toHaveBeenCalled();
  });

  it('does not search when pk: query is too short', async () => {
    renderHook(() => useMentionAutocomplete({ content: 'Hello pk:ab' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should not be called because 'ab' is only 2 characters (min is 3)
    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('does not search when pubky query is too short', async () => {
    renderHook(() => useMentionAutocomplete({ content: 'Hello pubkyab' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should not be called because 'ab' is only 2 characters (min is 3)
    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('skips complete pubkeys in pk: search', async () => {
    // A complete pubkey is 52 characters
    const completePubky = 'a'.repeat(52);
    renderHook(() => useMentionAutocomplete({ content: `Hello pk:${completePubky}` }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('skips complete pubkeys in pubky search', async () => {
    // A complete pubkey is 52 characters
    const completePubky = 'a'.repeat(52);
    renderHook(() => useMentionAutocomplete({ content: `Hello pubky${completePubky}` }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockFetchUsersById).not.toHaveBeenCalled();
  });

  it('closes popover when close is called', async () => {
    setMockUserDetailsMap(new Map([['user1', { id: 'user1', name: 'User One', image: null } as NexusUserDetails]]));

    const { result, rerender } = renderHook(({ content }) => useMentionAutocomplete({ content }), {
      initialProps: { content: 'Hello @jo' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Open the popover by triggering search
    rerender({ content: 'Hello @jo' });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Close the popover
    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedIndex).toBeNull();
  });

  describe('keyboard navigation', () => {
    it('handleKeyDown returns false when popover is closed', () => {
      const { result } = renderHook(() => useMentionAutocomplete({ content: '' }));

      const event = mockKeyboardEvent({ key: 'ArrowDown', preventDefault: vi.fn() });
      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(false);
    });
  });
});
