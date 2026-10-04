import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { NEXUS_USER_STREAM_MAX_LIMIT } from '@/config/nexus';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockPubky } from '@/test-utils/pubky';
import { useUserStream } from './useUserStream';
import { WHO_TO_FOLLOW_BUFFER_SIZE, WHO_TO_FOLLOW_PAGE_SIZE } from './useUserStream.constants';

/**
 * The Who to Follow page reads the `recommended` row it shares with the sidebar, so it opens on
 * whatever an earlier surface cached: nothing, the sidebar's buffer, the full row bootstrap
 * persisted, or a row a previous visit filled. The page shows up to 30 from that row in one read,
 * while Nexus rejects `limit` above 20 on `/v0/stream/users/ids` and serves `recommended` as a
 * sample of the user's pool whatever the `skip`, so a top-up overlaps what is cached already.
 *
 * Real Dexie, real controller and application, only the Nexus read service replaced.
 */

const VIEWER = mockPubky('viewer');
const RECOMMENDED = Array.from({ length: 40 }, (_, i) => mockPubky(`recommended-${i}`));

const whoToFollowPageParams = {
  streamId: UserStreamTypes.RECOMMENDED,
  limit: WHO_TO_FOLLOW_PAGE_SIZE,
  bufferSize: WHO_TO_FOLLOW_PAGE_SIZE,
  refillThreshold: WHO_TO_FOLLOW_PAGE_SIZE,
  includeRelationships: true,
  excludeFollowing: true,
};

const seedCachedStream = async (length: number) => {
  await LocalStreamUsersService.upsert({ streamId: UserStreamTypes.RECOMMENDED, stream: RECOMMENDED.slice(0, length) });
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

    await waitFor(() => {
      expect(result.current.users).toHaveLength(NEXUS_USER_STREAM_MAX_LIMIT);
    });
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

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });

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

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });
    // Flush the refill effect that would follow a short list before asserting it never ran.
    await act(async () => {});

    expect(refresh).not.toHaveBeenCalled();
    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(0, WHO_TO_FOLLOW_PAGE_SIZE));
  });

  it('fills in for followed users from the cached tail without asking Nexus', async () => {
    await seedCachedStream(35);
    await markFollowed(3);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });

    expect(fetchStream).not.toHaveBeenCalled();
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(3, 3 + WHO_TO_FOLLOW_PAGE_SIZE));
  });

  it('asks Nexus once, within the limit, when the cached row does not cover the followed users', async () => {
    await seedCachedStream(25);
    await markFollowed(6);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });

    expect(requestedPages()).toEqual([{ skip: 25, limit: NEXUS_USER_STREAM_MAX_LIMIT }]);
    // The cached row minus the followed users, then the sampled ids the row did not hold yet.
    expect(shownIds(result)).toEqual([...RECOMMENDED.slice(6, 25), ...RECOMMENDED.slice(25, 36)]);
  });
});
