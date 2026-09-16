import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { useUnreadPosts } from '@/hooks/useUnreadPosts/useUnreadPosts';
import { NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import type { NexusPost } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, REACH, SORT } from '@/stores/home/home.types';
import { mockSession } from '@/test-utils/pubky';

const streamId: PostStreamId = PostStreamTypes.TIMELINE_ALL_ALL;

function nexusPost(id: string, indexed_at: number): NexusPost {
  return {
    details: {
      id,
      author: 'author',
      indexed_at,
      kind: 'short',
      content: 'New post',
      uri: `pubky://author/pub/pubky.app/posts/${id}`,
      attachments: null,
    },
    counts: { replies: 0, tags: 0, unique_tags: 0, reposts: 0 },
    relationships: { replied: null, reposted: null, mentioned: [] },
    tags: [],
    bookmark: null,
  };
}

afterEach(() => {
  StreamCoordinator.resetInstance();
  useAuthStore.getState().reset();
  vi.restoreAllMocks();
});

it('retries failed unread hydration on the next poll and resumes new-post polling', async () => {
  const now = Date.now();
  const existingId = buildCompositeId({ pubky: 'author', id: 'existing' });
  const newId = buildCompositeId({ pubky: 'author', id: 'newest' });
  await PostDetailsModel.create({
    id: existingId,
    indexed_at: now,
    kind: 'short',
    content: 'Existing post',
    uri: 'pubky://author/pub/pubky.app/posts/existing',
    attachments: null,
  });
  await PostStreamModel.upsert(streamId as PostStreamId, [existingId]);
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: 'viewer', hasProfile: true });
  useAuthStore.getState().setHasHydrated(true);
  useHomeStore.setState({
    sort: SORT.TIMELINE,
    reach: REACH.ALL,
    content: CONTENT.ALL,
    taggedAsActive: false,
    hasHydrated: true,
  });

  const newPost = nexusPost('newest', now + 1);
  const retry = Promise.withResolvers<NexusPost[]>();
  const fetchKeys = vi
    .spyOn(NexusPostStreamService, 'fetch')
    .mockResolvedValueOnce({ post_keys: [newId], last_post_score: now + 1 })
    .mockResolvedValue({ post_keys: [], last_post_score: null });
  const hydrate = vi
    .spyOn(NexusPostStreamService, 'fetchByIds')
    .mockRejectedValueOnce(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Could not hydrate unread posts', {
        service: ErrorService.Nexus,
        operation: 'fetchByIds',
      }),
    )
    .mockReturnValue(retry.promise);
  vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
  const { result } = renderHook(() => useUnreadPosts({ streamId }));
  const coordinator = StreamCoordinator.getInstance();
  coordinator.configure({ intervalMs: 100, pollOnStart: true, respectPageVisibility: false });
  await coordinator.setRoute(APP_ROUTES.HOME);
  await coordinator.start();

  await waitFor(() => expect(hydrate).toHaveBeenCalled());
  expect(result.current.unreadCount).toBe(0);
  await act(async () => {
    retry.resolve([newPost]);
  });
  await waitFor(() => expect(result.current.unreadPostIds).toEqual([newId]));
  await waitFor(() => expect(fetchKeys.mock.calls.length).toBeGreaterThanOrEqual(2));
  coordinator.stop();
  expect(hydrate.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(await StreamPostsController.getStreamHead({ streamId })).toBe(now + 1);
});

it('hydrates older unread misses even with a cached head, then reads locally', async () => {
  const head = nexusPost('head', Date.now());
  const pending = nexusPost('pending', head.details.indexed_at - 1);
  const headId = buildCompositeId({ pubky: 'author', id: head.details.id });
  const pendingId = buildCompositeId({ pubky: 'author', id: pending.details.id });
  await PostDetailsModel.create({ ...head.details, id: headId });
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [headId, pendingId]);
  const hydrate = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([pending]);
  vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);

  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(head.details.indexed_at);
  expect(hydrate).toHaveBeenCalledWith(expect.objectContaining({ post_ids: [pendingId] }));
  expect(await PostDetailsModel.findById(pendingId)).not.toBeNull();
  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(head.details.indexed_at);
  expect(hydrate).toHaveBeenCalledTimes(1);
});

it('discards retry results after the viewer session changes', async () => {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: 'viewer', hasProfile: true });
  const pending = nexusPost('pending', Date.now());
  const pendingId = buildCompositeId({ pubky: 'author', id: pending.details.id });
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [pendingId]);
  const retry = Promise.withResolvers<NexusPost[]>();
  const hydrate = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockReturnValue(retry.promise);
  const head = StreamPostsController.getOrFetchStreamHead({ streamId });
  await waitFor(() => expect(hydrate).toHaveBeenCalled());

  useAuthStore.getState().reset();
  retry.resolve([pending]);

  expect(await head).toBe(0);
  expect(await PostDetailsModel.findById(pendingId)).toBeNull();
});

it.each([true, false])('keeps polling when Nexus omits an unread ID (cached main head: %s)', async (hasMainHead) => {
  const main = nexusPost('main', Date.now());
  const mainId = buildCompositeId({ pubky: 'author', id: main.details.id });
  const pendingId = buildCompositeId({ pubky: 'author', id: 'unavailable' });
  if (hasMainHead) {
    await PostDetailsModel.create({ ...main.details, id: mainId });
    await PostStreamModel.upsert(streamId as PostStreamId, [mainId]);
  }
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [pendingId]);
  vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);

  const head = await StreamPostsController.getOrFetchStreamHead({ streamId });

  expect(head).toBe(hasMainHead ? main.details.indexed_at : 1);
  expect((await StreamPostsController.getUnreadStream({ streamId }))?.stream).toEqual([pendingId]);
});
