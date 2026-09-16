import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useSearchPeople } from './useSearchPeople';

const { mockFetchUsersByTags, mockGetOrFetchUsers, mockGetAvatarUrl, mutedIds } = vi.hoisted(() => ({
  mockFetchUsersByTags: vi.fn(),
  mockGetOrFetchUsers: vi.fn(),
  mockGetAvatarUrl: vi.fn(() => 'avatar-url'),
  mutedIds: new Set<string>(),
}));

vi.mock('@/controllers/search/search', () => ({
  SearchController: { fetchUsersByTags: mockFetchUsersByTags },
}));

vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: { getOrFetchUsers: mockGetOrFetchUsers },
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyDetails: ({ userIds }: { userIds: Pubky[] }) => mockHydrationRead(mockUserDetailsMap, userIds),
    getManyCounts: ({ userIds }: { userIds: Pubky[] }) => mockHydrationRead(mockUserCountsMap, userIds),
    getManyRelationships: ({ userIds }: { userIds: Pubky[] }) => mockHydrationRead(mockUserRelationshipsMap, userIds),
  },
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: { getAvatarUrl: mockGetAvatarUrl },
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: () => ({
    mutedUserIds: [...mutedIds],
    mutedUserIdSet: mutedIds,
    isMuted: (id: string) => mutedIds.has(id),
    isLoading: false,
  }),
}));

// Use a small page size so hasMore thresholds are easy to exercise.
vi.mock('@/config/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/search')>();
  return { ...actual, SEARCH_PEOPLE_PAGE_SIZE: 3 };
});

// Seeded lookup tables the hook's live query reads back through UserController.
let mockUserDetailsMap = new Map<Pubky, NexusUserDetails>();
let mockUserCountsMap = new Map<Pubky, NexusUserCounts>();
let mockUserRelationshipsMap = new Map<Pubky, UserRelationshipsModelSchema>();
// When set, the read-back never resolves — models the gap between fetch settle
// and the Dexie live-query emission for a freshly committed id list.
let mockHydrationBlocked = false;

function mockHydrationRead<T>(source: Map<Pubky, T>, userIds: Pubky[]): Promise<Map<Pubky, T>> {
  if (mockHydrationBlocked) {
    return new Promise(() => {});
  }
  const picked = new Map<Pubky, T>();
  for (const id of userIds) {
    const value = source.get(id);
    if (value !== undefined) {
      picked.set(id, value);
    }
  }
  return Promise.resolve(picked);
}

// Faithful fake of the useLiveQuery contract, so the tests exercise the real
// emission sequence: the default is returned synchronously, each deps change
// re-runs the querier, the result lands asynchronously, and the PREVIOUS
// emission is retained until then — the property the hook's hydration gate is
// built around. (The factory is hoisted, so React must be imported inside it.)
vi.mock('dexie-react-hooks', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useLiveQuery: <T>(queryFn: () => Promise<T> | T, deps: unknown[], defaultValue: T): T => {
      const [emission, setEmission] = useState<T>(defaultValue);
      /* eslint-disable react-hooks/exhaustive-deps -- the fake forwards the caller's deps array verbatim, like the real useLiveQuery */
      useEffect(() => {
        let cancelled = false;
        void Promise.resolve(queryFn()).then((result) => {
          if (!cancelled) setEmission(result);
        });
        return () => {
          cancelled = true;
        };
      }, deps);
      /* eslint-enable react-hooks/exhaustive-deps */
      return emission;
    },
  };
});

const USER_A = asOpaque<Pubky>('usera8ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');
const USER_B = asOpaque<Pubky>('userb8ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');
const USER_C = asOpaque<Pubky>('userc8ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');
const USER_D = asOpaque<Pubky>('userd8ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');

function detailsFixture(name: string, image: string | null = null): NexusUserDetails {
  return asOpaque<NexusUserDetails>({ name, image, indexed_at: 1 });
}

function countsFixture(tagged: number, posts: number): NexusUserCounts {
  return asOpaque<NexusUserCounts>({ tagged, posts });
}

function relationshipFixture(following: boolean): UserRelationshipsModelSchema {
  return asOpaque<UserRelationshipsModelSchema>({ following, followed_by: false });
}

function scored(ids: Pubky[]): { user_id: Pubky; score: number }[] {
  return ids.map((user_id, index) => ({ user_id, score: 100 - index }));
}

function seedUser(id: Pubky, name: string, { following = false, image = null as string | null } = {}) {
  mockUserDetailsMap.set(id, detailsFixture(name, image));
  mockUserCountsMap.set(id, countsFixture(5, 10));
  mockUserRelationshipsMap.set(id, relationshipFixture(following));
}

beforeEach(() => {
  vi.clearAllMocks();
  mutedIds.clear();
  mockUserDetailsMap = new Map();
  mockUserCountsMap = new Map();
  mockUserRelationshipsMap = new Map();
  mockHydrationBlocked = false;
  mockFetchUsersByTags.mockResolvedValue([]);
  mockGetOrFetchUsers.mockResolvedValue([]);
  mockGetAvatarUrl.mockReturnValue('avatar-url');
});

describe('useSearchPeople', () => {
  it('fetches the first page with joined tags and hydrates the returned ids', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A, USER_B]));
    seedUser(USER_A, 'Alice');
    seedUser(USER_B, 'Bob');

    const { result } = renderHook(() => useSearchPeople(['synonym', 'rust']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchUsersByTags).toHaveBeenCalledWith({ tags: 'synonym,rust', skip: 0, limit: 3 });
    expect(mockGetOrFetchUsers).toHaveBeenCalledWith({ userIds: [USER_A, USER_B] });
    expect(result.current.users.map((user) => user.name)).toEqual(['Alice', 'Bob']);
  });

  it('clamps the request to the endpoint tag ceiling', async () => {
    mockFetchUsersByTags.mockResolvedValue([]);

    const { result } = renderHook(() => useSearchPeople(['a', 'b', 'c', 'd', 'e', 'f']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchUsersByTags).toHaveBeenCalledWith({ tags: 'a,b,c,d,e', skip: 0, limit: 3 });
  });

  it('keeps loading until the hydration read-back emits for the fetched list', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A]));
    seedUser(USER_A, 'Alice');
    // Hold the read-back: the fetch settles and commits the id list, but the
    // live-query emission for it never lands. The retained emission ran for the
    // emptied in-flight list and carries the PREVIOUS epoch, so the gate must
    // keep the section loading instead of flashing settled-empty (would regress
    // if the epoch were bumped at fetch start again).
    mockHydrationBlocked = true;

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(mockGetOrFetchUsers).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.loading).toBe(true);
    expect(result.current.users).toEqual([]);
  });

  it('settles as loaded-empty when the read-back emits without hydrating anything', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A]));
    // Nothing seeded: a stale search index, or a swallowed `by_ids` failure,
    // leaves every id unhydrated. The section must settle instead of pinning
    // itself on skeletons forever (#2355 review).

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([]);
  });

  it('dedupes ids repeated within a single page', async () => {
    mockFetchUsersByTags.mockResolvedValue([...scored([USER_A]), ...scored([USER_A, USER_B])]);
    seedUser(USER_A, 'Alice');
    seedUser(USER_B, 'Bob');

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGetOrFetchUsers).toHaveBeenCalledWith({ userIds: [USER_A, USER_B] });
    expect(result.current.users.map((user) => user.name)).toEqual(['Alice', 'Bob']);
    // The cursor still advances by the raw response length (3 = full page).
    expect(result.current.hasMore).toBe(true);
  });

  it('does nothing without tags', async () => {
    const { result } = renderHook(() => useSearchPeople([]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchUsersByTags).not.toHaveBeenCalled();
    expect(result.current.users).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('projects details, counts and relationship into UserListItemData', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A]));
    mockUserDetailsMap.set(USER_A, detailsFixture('Alice', 'img.png'));
    mockUserCountsMap.set(USER_A, countsFixture(7, 42));
    mockUserRelationshipsMap.set(USER_A, relationshipFixture(true));

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.users).toEqual([
      {
        id: USER_A,
        name: 'Alice',
        avatarUrl: 'avatar-url',
        stats: { tags: 7, posts: 42 },
        isFollowing: true,
      },
    ]);
  });

  it('does not compute an avatar url for users without an image', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A]));
    seedUser(USER_A, 'Alice', { image: null });

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.users[0].avatarUrl).toBeNull();
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('drops ids that never hydrated and muted users', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A, USER_B, USER_C]));
    seedUser(USER_A, 'Alice');
    seedUser(USER_C, 'Cleo');
    // USER_B has no details (e.g. deleted); USER_C is muted.
    mutedIds.add(USER_C);

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.users.map((user) => user.name)).toEqual(['Alice']);
  });

  it('reports hasMore only when the page came back full', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A, USER_B]));
    seedUser(USER_A, 'Alice');
    seedUser(USER_B, 'Bob');

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it('loads the next page from the raw-length cursor and dedupes repeated ids', async () => {
    mockFetchUsersByTags.mockResolvedValueOnce(scored([USER_A, USER_B, USER_C]));
    seedUser(USER_A, 'Alice');
    seedUser(USER_B, 'Bob');
    seedUser(USER_C, 'Cleo');
    seedUser(USER_D, 'Dion');

    const { result } = renderHook(() => useSearchPeople(['synonym']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    // Second page repeats USER_C (cursor drift) and adds USER_D.
    mockFetchUsersByTags.mockResolvedValueOnce(scored([USER_C, USER_D]));
    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockFetchUsersByTags).toHaveBeenLastCalledWith({ tags: 'synonym', skip: 3, limit: 3 });
    // Only the genuinely new id gets hydrated and appended.
    expect(mockGetOrFetchUsers).toHaveBeenLastCalledWith({ userIds: [USER_D] });
    expect(result.current.users.map((user) => user.name)).toEqual(['Alice', 'Bob', 'Cleo', 'Dion']);
    expect(result.current.hasMore).toBe(false);
  });

  it('stays settled while an appended page hydrates — loadMore must never flip loading back', async () => {
    mockFetchUsersByTags.mockResolvedValueOnce(scored([USER_A, USER_B, USER_C]));
    seedUser(USER_A, 'Alice');
    seedUser(USER_B, 'Bob');
    seedUser(USER_C, 'Cleo');

    const { result } = renderHook(() => useSearchPeople(['synonym']));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // USER_D is deliberately NOT seeded: its hydration emission has not landed
    // yet. Appending must not re-enter loading (the "Show more" button would
    // leave the DOM under the pointer) — the existing cards stay settled and
    // the new one pops in when its emission arrives.
    mockFetchUsersByTags.mockResolvedValueOnce(scored([USER_D]));
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.users.map((user) => user.name)).toEqual(['Alice', 'Bob', 'Cleo']);
  });

  it('stops paginating when a page comes back empty', async () => {
    mockFetchUsersByTags.mockResolvedValueOnce(scored([USER_A, USER_B, USER_C]));
    seedUser(USER_A, 'Alice');
    seedUser(USER_B, 'Bob');
    seedUser(USER_C, 'Cleo');

    const { result } = renderHook(() => useSearchPeople(['synonym']));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetchUsersByTags.mockResolvedValueOnce([]);
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.hasMore).toBe(false);
    expect(result.current.users).toHaveLength(3);
  });

  it('surfaces initial-fetch errors through onError and stops pagination', async () => {
    const onError = vi.fn();
    mockFetchUsersByTags.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSearchPeople(['synonym'], { onError }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.users).toEqual([]);
  });
});
