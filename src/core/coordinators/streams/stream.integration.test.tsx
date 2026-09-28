import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { PostStreamApplication } from '@/application/stream/posts/post';
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
  await waitFor(async () => expect(await PostDetailsModel.findById(pendingId)).not.toBeNull());
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

it('does not restart polling at the newest page when the main head also lacks details', async () => {
  const mainId = buildCompositeId({ pubky: 'author', id: 'missing-main' });
  const pendingId = buildCompositeId({ pubky: 'author', id: 'pending' });
  await PostStreamModel.upsert(streamId as PostStreamId, [mainId]);
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [pendingId]);
  vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);

  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(0);
  expect((await StreamPostsController.getUnreadStream({ streamId }))?.stream).toEqual([pendingId]);
});

it.each([true, false])(
  'discovers newer posts while one unread retry is pending (cached unread head: %s)',
  async (hasUnreadHead) => {
    const now = Date.now();
    const main = nexusPost('main', now);
    const ready = nexusPost('ready', now + 2);
    const pending = nexusPost('pending', now + 1);
    const fresh = nexusPost('fresh', now + 3);
    const mainId = buildCompositeId({ pubky: 'author', id: main.details.id });
    const readyId = buildCompositeId({ pubky: 'author', id: ready.details.id });
    const pendingId = buildCompositeId({ pubky: 'author', id: pending.details.id });
    const freshId = buildCompositeId({ pubky: 'author', id: fresh.details.id });
    await PostDetailsModel.create({ ...main.details, id: mainId });
    await PostStreamModel.upsert(streamId as PostStreamId, [mainId]);
    if (hasUnreadHead) await PostDetailsModel.create({ ...ready.details, id: readyId });
    await UnreadPostStreamModel.upsert(streamId as PostStreamId, hasUnreadHead ? [readyId, pendingId] : [pendingId]);
    useAuthStore.getState().init({ session: mockSession(), currentUserPubky: 'viewer', hasProfile: true });
    useAuthStore.getState().setHasHydrated(true);
    useHomeStore.setState({
      sort: SORT.TIMELINE,
      reach: REACH.ALL,
      content: CONTENT.ALL,
      taggedAsActive: false,
      hasHydrated: true,
    });
    const retry = Promise.withResolvers<NexusPost[]>();
    const hydrate = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockImplementation(async ({ post_ids }) => {
      return post_ids.includes(pendingId) ? retry.promise : [fresh];
    });
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    const fetchKeys = vi
      .spyOn(NexusPostStreamService, 'fetch')
      .mockResolvedValueOnce({ post_keys: [freshId], last_post_score: fresh.details.indexed_at })
      .mockResolvedValue({ post_keys: [], last_post_score: null });
    const { result } = renderHook(() => useUnreadPosts({ streamId }));
    const coordinator = StreamCoordinator.getInstance();
    coordinator.configure({ intervalMs: 100, pollOnStart: true, respectPageVisibility: false });
    await coordinator.setRoute(APP_ROUTES.HOME);
    await coordinator.start();

    try {
      await waitFor(() => expect(result.current.unreadPostIds).toContain(freshId));
      await waitFor(() => expect(fetchKeys.mock.calls.length).toBeGreaterThanOrEqual(3));
      expect(await PostDetailsModel.findById(pendingId)).toBeNull();
      expect(hydrate.mock.calls.filter(([params]) => params.post_ids.includes(pendingId))).toHaveLength(1);
    } finally {
      coordinator.stop();
      await act(async () => {
        retry.resolve([pending]);
      });
      await waitFor(() => expect(result.current.unreadPostIds).toContain(pendingId));
    }
  },
);

it('replaces an obsolete session retry without letting its cleanup remove the current retry', async () => {
  const main = nexusPost('main', Date.now());
  const pending = nexusPost('pending', main.details.indexed_at + 1);
  const mainId = buildCompositeId({ pubky: 'author', id: main.details.id });
  const pendingId = buildCompositeId({ pubky: 'author', id: pending.details.id });
  await PostDetailsModel.create({ ...main.details, id: mainId });
  await PostStreamModel.upsert(streamId as PostStreamId, [mainId]);
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [pendingId]);
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: 'viewer', hasProfile: true });
  const oldRetry = Promise.withResolvers<NexusPost[]>();
  const currentRetry = Promise.withResolvers<NexusPost[]>();
  const hydrate = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus');
  vi.spyOn(NexusPostStreamService, 'fetchByIds')
    .mockReturnValueOnce(oldRetry.promise)
    .mockReturnValue(currentRetry.promise);
  vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);

  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(main.details.indexed_at);
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: 'viewer', hasProfile: true });
  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(main.details.indexed_at);
  expect(hydrate).toHaveBeenCalledTimes(2);

  oldRetry.resolve([pending]);
  await hydrate.mock.results[0].value;
  expect(await PostDetailsModel.findById(pendingId)).toBeNull();
  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(main.details.indexed_at);
  expect(hydrate).toHaveBeenCalledTimes(2);
  currentRetry.resolve([pending]);
  await hydrate.mock.results[1].value;
  await waitFor(async () => expect(await PostDetailsModel.findById(pendingId)).not.toBeNull());
});

it('releases a failed background retry so the next poll can recover its unread details', async () => {
  const main = nexusPost('main', Date.now());
  const pending = nexusPost('pending', main.details.indexed_at + 1);
  const mainId = buildCompositeId({ pubky: 'author', id: main.details.id });
  const pendingId = buildCompositeId({ pubky: 'author', id: pending.details.id });
  await PostDetailsModel.create({ ...main.details, id: mainId });
  await PostStreamModel.upsert(streamId as PostStreamId, [mainId]);
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [pendingId]);
  const hydrate = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus');
  vi.spyOn(NexusPostStreamService, 'fetchByIds')
    .mockRejectedValueOnce(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Unread hydration failed', {
        service: ErrorService.Nexus,
        operation: 'fetchByIds',
      }),
    )
    .mockResolvedValue([pending]);
  vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);

  expect(await StreamPostsController.getOrFetchStreamHead({ streamId })).toBe(main.details.indexed_at);
  expect(await hydrate.mock.results[0].value).toBe(false);
  await StreamPostsController.getOrFetchStreamHead({ streamId });
  await waitFor(async () => expect(await PostDetailsModel.findById(pendingId)).not.toBeNull());
  expect(hydrate).toHaveBeenCalledTimes(2);
});

it('waits for unread hydration when no cursor is cached and re-reads rows replaced during that wait', async () => {
  const pending = nexusPost('pending', Date.now());
  const pendingId = buildCompositeId({ pubky: 'author', id: pending.details.id });
  const fresh = nexusPost('fresh-main', pending.details.indexed_at + 5);
  const freshId = buildCompositeId({ pubky: 'author', id: fresh.details.id });
  await UnreadPostStreamModel.upsert(streamId as PostStreamId, [pendingId]);
  const retry = Promise.withResolvers<NexusPost[]>();
  const hydrate = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockReturnValue(retry.promise);
  vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
  let settled = false;
  const head = StreamPostsController.getOrFetchStreamHead({ streamId }).then((value) => {
    settled = true;
    return value;
  });
  await waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1));
  expect(settled).toBe(false);
  await StreamPostsController.clearUnreadStream({ streamId });
  await PostDetailsModel.create({ ...fresh.details, id: freshId });
  await PostStreamModel.upsert(streamId as PostStreamId, [freshId]);
  retry.resolve([pending]);

  expect(await head).toBe(fresh.details.indexed_at);
  expect(await StreamPostsController.getUnreadStream({ streamId })).toBeNull();
});
