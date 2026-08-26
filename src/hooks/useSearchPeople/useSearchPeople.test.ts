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
    getManyDetails: vi.fn(),
    getManyCounts: vi.fn(),
    getManyRelationships: vi.fn(),
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

// Dispatch each useLiveQuery call to the matching prebuilt map by sniffing the
// query function body — same pattern as useProfileConnections.test.tsx.
let mockUserDetailsMap = new Map<Pubky, NexusUserDetails>();
let mockUserCountsMap = new Map<Pubky, NexusUserCounts>();
let mockUserRelationshipsMap = new Map<Pubky, UserRelationshipsModelSchema>();

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T>(queryFn: () => Promise<T> | T, _deps: unknown[], defaultValue: T): T => {
    const queryFnString = queryFn.toString();
    if (queryFnString.includes('getManyDetails')) return mockUserDetailsMap as T;
    if (queryFnString.includes('getManyCounts')) return mockUserCountsMap as T;
    if (queryFnString.includes('getManyRelationships')) return mockUserRelationshipsMap as T;
    return defaultValue;
  },
}));

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

  it('keeps loading until the details read-back emits for the fetched ids', async () => {
    mockFetchUsersByTags.mockResolvedValue(scored([USER_A]));
    // No seeded details — simulates the gap between fetch settle and the
    // Dexie live-query emission.

    const { result } = renderHook(() => useSearchPeople(['synonym']));

    await waitFor(() => expect(mockGetOrFetchUsers).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.loading).toBe(true);
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
