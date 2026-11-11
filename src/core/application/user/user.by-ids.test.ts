import { afterEach, expect, it, vi } from 'vitest';
import { UserStreamApplication } from '@/application/stream/users/users';
import { UserApplication } from '@/application/user/user';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { LocalFollowService } from '@/services/local/follow/follow';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusUser } from '@/services/nexus/nexus.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';

const makeUser = (id: string, following = false): NexusUser => ({
  details: { id, name: 'Test User', bio: '', links: null, status: null, image: null, indexed_at: 1 },
  counts: {
    tagged: 0,
    tags: 0,
    unique_tags: 0,
    posts: 0,
    replies: 0,
    following: 0,
    followers: 0,
    friends: 0,
    collections: 0,
    bookmarks: 0,
  },
  tags: [],
  relationship: { following, followed_by: false },
});
const response = (users: NexusUser[]) =>
  new Response(JSON.stringify(users), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => {
  nexusQueryClient.clear();
  vi.restoreAllMocks();
});
it('preserves a follow when a later card joins a subrequest of a still-incomplete batch', async () => {
  nexusQueryClient.clear();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(900);
  const aliceResponse = Promise.withResolvers<Response>();
  const bobResponse = Promise.withResolvers<Response>();
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.user_ids.length === 1 && body.user_ids[0] === 'alice') return aliceResponse.promise;
    if (body.user_ids.includes('bob') && fetch.mock.calls.length <= 2) return bobResponse.promise;
    return Promise.resolve(response([makeUser('bob', true)]));
  });
  const alice = UserApplication.fetch({ userId: 'alice', viewerId: 'viewer' });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  clock.mockReturnValue(1000);
  const batch = UserStreamApplication.fetchMissingUsersFromNexus({
    cacheMissUserIds: ['alice', 'bob'],
    viewerId: 'viewer',
  });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  clock.mockReturnValue(1500);
  await LocalFollowService.create({ follower: 'viewer', followee: 'bob' });
  expect((await UserRelationshipsModel.findById('bob'))?.following).toBe(true);
  clock.mockReturnValue(2000);
  const byIds = vi.spyOn(NexusUserStreamService, 'fetchByIds');
  const bob = UserApplication.fetch({ userId: 'bob', viewerId: 'viewer' });
  await vi.waitFor(() => expect(byIds).toHaveBeenCalledOnce());
  clock.mockReturnValue(3000);
  bobResponse.resolve(response([makeUser('bob', false)]));
  await bob;
  const followingAfterCard = (await UserRelationshipsModel.findById('bob'))?.following;
  aliceResponse.resolve(response([makeUser('alice')]));
  await Promise.all([alice, batch]);
  expect(followingAfterCard).toBe(true);
});
