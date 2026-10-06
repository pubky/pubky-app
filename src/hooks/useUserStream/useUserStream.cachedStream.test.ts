import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { NEXUS_USER_STREAM_MAX_LIMIT, STARTER_PACK_SUGGESTIONS_LIMIT } from '@/config/nexus';
import { StreamUserController } from '@/controllers/stream/users/users';
import { buildStarterPackStreamId } from '@/models/stream/user/userStream.helper';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockPubky } from '@/test-utils/pubky';
import { useUserStream } from './useUserStream';
import {
  WHO_TO_FOLLOW_BUFFER_SIZE,
  WHO_TO_FOLLOW_PAGE_SIZE,
  WHO_TO_FOLLOW_REFILL_THRESHOLD,
  WHO_TO_FOLLOW_USER_LIMIT,
} from './useUserStream.constants';

/**
 * The Who to Follow page reads the `recommended` row it shares with the sidebar, so it opens on
 * whatever an earlier surface cached: nothing, the sidebar's buffer, the full row bootstrap
 * persisted, or a row a previous visit filled. The page shows up to 30 from that row in one read,
 * while Nexus rejects `limit` above 20 on `/v0/stream/users/ids` and serves `recommended` as a
 * sample of the user's pool whatever the `skip`, so a top-up overlaps what is cached already.
 *
 * Real Dexie, real controller and application, only the Nexus read service replaced.
 */

// Dexie live queries settle a tick at a time: a read, its three live queries, a refill read and three
// more can pass the 1 s default when the whole suite loads every core.
const WAIT_FOR_TIMEOUT_MS = 5_000;
const VIEWER = mockPubky('viewer');
const RECOMMENDED = Array.from({ length: 40 }, (_, i) => mockPubky(`recommended-${i}`));

const whoToFollowPageParams = {
  streamId: UserStreamTypes.RECOMMENDED,
  limit: WHO_TO_FOLLOW_PAGE_SIZE,
  bufferSize: WHO_TO_FOLLOW_PAGE_SIZE,
  refillThreshold: WHO_TO_FOLLOW_PAGE_SIZE,
  includeRelationships: true,
  excludeFollowing: true,
  showAll: true,
};

/** WhoToFollowSidebar's params, signed in. */
const sidebarParams = {
  streamId: UserStreamTypes.RECOMMENDED,
  limit: WHO_TO_FOLLOW_USER_LIMIT,
  bufferSize: WHO_TO_FOLLOW_BUFFER_SIZE,
  refillThreshold: WHO_TO_FOLLOW_REFILL_THRESHOLD,
  includeRelationships: true,
  excludeFollowing: true,
};

const STARTER_PACK_STREAM_ID = buildStarterPackStreamId(['bitcoin']);

/** useStarterPackSuggestions' params. */
const starterPackParams = {
  streamId: STARTER_PACK_STREAM_ID,
  limit: STARTER_PACK_SUGGESTIONS_LIMIT,
  bufferSize: STARTER_PACK_SUGGESTIONS_LIMIT,
  refillThreshold: STARTER_PACK_SUGGESTIONS_LIMIT,
  includeRelationships: true,
  excludeFollowing: true,
};

const seedCachedStream = async (
  length: number,
  streamId: typeof UserStreamTypes.RECOMMENDED | typeof STARTER_PACK_STREAM_ID = UserStreamTypes.RECOMMENDED,
) => {
  await LocalStreamUsersService.upsert({ streamId, stream: RECOMMENDED.slice(0, length) });
};

const markFollowed = async (count: number) => {
  await UserRelationshipsModel.bulkSave(
    RECOMMENDED.slice(0, count).map((id) => [id, { following: true, followed_by: false }]),
  );
};

describe('useUserStream reading the Who to Follow page over a cached stream', () => {
  let fetchStream: MockInstance<typeof NexusUserStreamService.fetch>;

  const requestedPages = () =>
    fetchStream.mock.calls.map(([{ params }]) => ({ skip: params.skip, limit: params.limit }));

  const shownIds = (result: { current: ReturnType<typeof useUserStream> }) =>
    result.current.users.map((user) => user.id);

  beforeEach(async () => {
    useAuthStore.setState({ currentUserPubky: VIEWER });
    // Nexus answers with a full page sampled from the pool whatever the `skip`: the back of it,
    // which overlaps a longer cached row and extends a shorter one.
    fetchStream = vi
      .spyOn(NexusUserStreamService, 'fetch')
      .mockImplementation(async ({ params: { limit = 0 } }) => RECOMMENDED.slice(RECOMMENDED.length - limit));
    await UserDetailsModel.bulkSave(
      RECOMMENDED.map((id) => ({
        id,
        name: `User ${id}`,
        bio: '',
        links: null,
        status: null,
        image: null,
        indexed_at: 1,
      })),
    );
    await UserRelationshipsModel.bulkSave(RECOMMENDED.map((id) => [id, { following: false, followed_by: false }]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ currentUserPubky: null });
  });

  it('never asks Nexus for more than its limit when nothing is cached', async () => {
    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(NEXUS_USER_STREAM_MAX_LIMIT);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    // One page, then one top-up that the sample cannot extend: both within the limit, no third.
    expect(requestedPages()).toEqual([
      { skip: 0, limit: NEXUS_USER_STREAM_MAX_LIMIT },
      { skip: NEXUS_USER_STREAM_MAX_LIMIT, limit: NEXUS_USER_STREAM_MAX_LIMIT },
    ]);
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(RECOMMENDED.length - NEXUS_USER_STREAM_MAX_LIMIT));
  });

  it('tops up a sidebar-seeded row once, within the Nexus limit', async () => {
    await seedCachedStream(WHO_TO_FOLLOW_BUFFER_SIZE);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );

    expect(requestedPages()).toEqual([{ skip: WHO_TO_FOLLOW_BUFFER_SIZE, limit: NEXUS_USER_STREAM_MAX_LIMIT }]);
    expect(shownIds(result)).toEqual([
      ...RECOMMENDED.slice(0, WHO_TO_FOLLOW_BUFFER_SIZE),
      ...RECOMMENDED.slice(RECOMMENDED.length - NEXUS_USER_STREAM_MAX_LIMIT),
    ]);
  });

  it('shows the whole cached row in one read when it already holds a full page', async () => {
    await seedCachedStream(WHO_TO_FOLLOW_PAGE_SIZE);
    const refresh = vi.spyOn(StreamUserController, 'refreshStreamSlice');

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    // Flush the refill effect that would follow a short list before asserting it never ran.
    await act(async () => {});

    expect(refresh).not.toHaveBeenCalled();
    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(0, WHO_TO_FOLLOW_PAGE_SIZE));
  });

  it('shows a cached row that grew past the page size whole, minus followed users, without asking Nexus', async () => {
    await seedCachedStream(35);
    await markFollowed(3);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(32);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(3, 35));
  });

  it('asks Nexus once, within the limit, when the cached row does not cover the followed users', async () => {
    await seedCachedStream(25);
    await markFollowed(6);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(34);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );

    expect(requestedPages()).toEqual([{ skip: 25, limit: NEXUS_USER_STREAM_MAX_LIMIT }]);
    // The cached row minus the followed users, then every sampled id the row did not hold yet.
    expect(shownIds(result)).toEqual([...RECOMMENDED.slice(6, 25), ...RECOMMENDED.slice(25, 40)]);
  });

  it('still lists the cached users whose details are present when hydrating the rest fails', async () => {
    await seedCachedStream(35);
    await UserDetailsModel.table.bulkDelete(RECOMMENDED.slice(30, 35));
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockRejectedValue(new Error('Nexus unavailable'));

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(result.current.error).toBeNull();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(0, 30));
    expect(fetchStream).not.toHaveBeenCalled();
  });

  it('refetch re-reads the whole cached row', async () => {
    await seedCachedStream(32);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(32);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await seedCachedStream(35);
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(35);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    expect(fetchStream).not.toHaveBeenCalled();
  });

  it('sidebar: serves its refill from the cached tail when the shared row is long', async () => {
    await seedCachedStream(30);
    await markFollowed(8);

    const { result } = renderHook(() => useUserStream(sidebarParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_USER_LIMIT);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual([RECOMMENDED[8], RECOMMENDED[9], RECOMMENDED[10]]);
  });

  it('sidebar: asks Nexus once, within the limit, when the shared row is short', async () => {
    await seedCachedStream(WHO_TO_FOLLOW_BUFFER_SIZE);
    await markFollowed(8);

    const { result } = renderHook(() => useUserStream(sidebarParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_USER_LIMIT);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(requestedPages()).toEqual([{ skip: WHO_TO_FOLLOW_BUFFER_SIZE, limit: WHO_TO_FOLLOW_BUFFER_SIZE }]);
    expect(shownIds(result)).toEqual([RECOMMENDED[8], RECOMMENDED[9], RECOMMENDED[30]]);
  });

  it('sidebar: shows its first users without any request when none are followed', async () => {
    await seedCachedStream(WHO_TO_FOLLOW_BUFFER_SIZE);

    const { result } = renderHook(() => useUserStream(sidebarParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_USER_LIMIT);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(0, WHO_TO_FOLLOW_USER_LIMIT));
  });

  it('starter pack: refills from the next cached page before asking Nexus', async () => {
    await seedCachedStream(20, STARTER_PACK_STREAM_ID);
    await markFollowed(5);

    const { result } = renderHook(() => useUserStream(starterPackParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(STARTER_PACK_SUGGESTIONS_LIMIT);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(5, 5 + STARTER_PACK_SUGGESTIONS_LIMIT));
  });

  it('starter pack: asks Nexus once, within the limit, when its cached page is short', async () => {
    await seedCachedStream(STARTER_PACK_SUGGESTIONS_LIMIT, STARTER_PACK_STREAM_ID);
    await markFollowed(5);

    const { result } = renderHook(() => useUserStream(starterPackParams));

    await waitFor(
      () => {
        expect(result.current.users).toHaveLength(STARTER_PACK_SUGGESTIONS_LIMIT);
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    );
    await act(async () => {});

    expect(requestedPages()).toEqual([{ skip: STARTER_PACK_SUGGESTIONS_LIMIT, limit: STARTER_PACK_SUGGESTIONS_LIMIT }]);
    expect(fetchStream.mock.calls[0][0].streamId).toBe(STARTER_PACK_STREAM_ID);
  });
});
