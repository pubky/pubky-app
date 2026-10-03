import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
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
 * whatever an earlier surface cached: nothing, the sidebar's buffer, or a row a previous visit
 * filled. Nexus rejects `limit` above 20 on `/v0/stream/users/ids`, and serves `recommended` as a
 * sample of the user's pool whatever the `skip`, so a refill overlaps what is cached already.
 *
 * Real Dexie, real controller and application, only the Nexus read service replaced.
 */

const NEXUS_USER_IDS_MAX_LIMIT = 20;
const VIEWER = mockPubky('viewer');
const RECOMMENDED = Array.from({ length: 30 }, (_, i) => mockPubky(`recommended-${i}`));

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

  it('reads one page within the Nexus limit when nothing is cached', async () => {
    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });

    expect(requestedPages()).toEqual([{ skip: 0, limit: NEXUS_USER_IDS_MAX_LIMIT }]);
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(RECOMMENDED.length - WHO_TO_FOLLOW_PAGE_SIZE));
  });

  it('refills a sidebar-seeded row once, within the Nexus limit', async () => {
    await seedCachedStream(WHO_TO_FOLLOW_BUFFER_SIZE);

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });

    expect(requestedPages()).toEqual([{ skip: WHO_TO_FOLLOW_BUFFER_SIZE, limit: NEXUS_USER_IDS_MAX_LIMIT }]);
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(0, WHO_TO_FOLLOW_PAGE_SIZE));
  });

  it('refills once past users the viewer already follows, merging the overlap', async () => {
    await seedCachedStream(25);
    const followed = RECOMMENDED.slice(0, 3);
    await UserRelationshipsModel.bulkSave(followed.map((id) => [id, { following: true, followed_by: false }]));

    const { result } = renderHook(() => useUserStream(whoToFollowPageParams));

    await waitFor(() => {
      expect(result.current.users).toHaveLength(WHO_TO_FOLLOW_PAGE_SIZE);
    });

    expect(requestedPages()).toEqual([{ skip: WHO_TO_FOLLOW_PAGE_SIZE, limit: NEXUS_USER_IDS_MAX_LIMIT }]);
    // The cached row minus the followed users, then the sampled ids the row did not hold yet.
    expect(shownIds(result)).toEqual(RECOMMENDED.slice(3, 3 + WHO_TO_FOLLOW_PAGE_SIZE));
  });

  it('serves a revisit from the cached row without asking Nexus', async () => {
    await seedCachedStream(25);
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
});
