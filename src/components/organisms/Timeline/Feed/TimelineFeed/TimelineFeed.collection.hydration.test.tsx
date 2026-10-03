import { act, render, waitFor } from '@testing-library/react';
import { postUriBuilder } from 'pubky-app-specs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { PostController } from '@/controllers/post/post';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { NexusUserService } from '@/services/nexus/user/user';
import { useAuthStore } from '@/stores/auth/auth.store';
import { LAYOUT } from '@/stores/home/home.types';

const route = vi.hoisted(() => ({ userId: '', postId: '' }));
vi.mock('next/navigation', () => ({
  useParams: () => route,
  usePathname: () => `/collections/${route.userId}/${route.postId}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
// Cold CardsPost stays on its real skeleton while its real usePostDetails is pending.
// No card, hook, controller, application, local service or database is mocked.

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

describe('collection batch hydration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    postStreamQueue.clear();
  });
  it('waits for batch hydration before mounting uncached cards', async () => {
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    const ids = Array.from({ length: 50 }, (_, i) => `0000000000${String(i).padStart(3, '0')}`);
    const memberIds = ids.map((id) => `${AUTHOR}:${id}`);
    const collectionId = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Cold collection',
      items: ids.map((id) => postUriBuilder(AUTHOR, id)),
    });
    route.userId = AUTHOR;
    route.postId = parseCompositeId(collectionId).id;
    // Public viewer; envelope exists (e.g. opened from a collection preview), member posts do not.
    useAuthStore.setState({ currentUserPubky: null });
    const stream = Promise.withResolvers<{ post_keys: string[]; last_post_score: null }>();
    const batch = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetchByIds>>>();
    const streamSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockReturnValue(stream.promise);
    const byIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockReturnValue(batch.promise);
    const view = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} requestedLayout={LAYOUT.CARDS} />);
    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    expect(view.container.querySelectorAll('[data-cy="post-card"]')).toHaveLength(0);
    expect(byIdsSpy).not.toHaveBeenCalled();
    await act(async () => stream.resolve({ post_keys: memberIds, last_post_score: null }));
    await waitFor(() => expect(byIdsSpy.mock.calls.some(([p]) => p.post_ids.length === 50)).toBe(true));
    expect(byIdsSpy.mock.calls.filter(([p]) => p.post_ids.length === 1)).toHaveLength(0);
    await act(async () => batch.resolve([]));
    await waitFor(() => expect(view.container.querySelectorAll('[data-cy="post-card"]')).toHaveLength(50));
    view.unmount();
  });
  it('keeps cold repost cards behind author and original-post batch hydration', async () => {
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    const users = Promise.withResolvers<Awaited<ReturnType<typeof NexusUserStreamService.fetchByIds>>>();
    const userBatchSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockReturnValue(users.promise);
    vi.spyOn(NexusUserService, 'details').mockResolvedValue({
      id: AUTHOR,
      name: 'Author',
      bio: '',
      links: [],
      status: null,
      image: null,
      indexed_at: 1,
    });
    const ids = Array.from({ length: 10 }, (_, i) => `0000000000${String(i).padStart(3, '0')}`);
    const memberIds = ids.map((id) => `${AUTHOR}:${id}`);
    const collectionId = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Cold collection',
      items: ids.map((id) => postUriBuilder(AUTHOR, id)),
    });
    route.userId = AUTHOR;
    route.postId = parseCompositeId(collectionId).id;
    // Member rows and their repost dependencies are initially absent from the cache.
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    const stream = Promise.withResolvers<{ post_keys: string[]; last_post_score: null }>();
    const batch = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetchByIds>>>();
    const streamSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockReturnValue(stream.promise);
    const byIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockReturnValue(batch.promise);
    const view = render(
      <TooltipProvider>
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} requestedLayout={LAYOUT.CARDS} />
      </TooltipProvider>,
    );
    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    const originals = ids.map((id, i) => `0000000001${String(i).padStart(3, '0')}`);
    const expectedOriginalIds = originals.map((id) => `${AUTHOR}:${id}`);
    const originalResponses = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetchByIds>>>();
    byIdsSpy.mockImplementation((p) =>
      p.post_ids.some((id) => memberIds.includes(id)) ? batch.promise : originalResponses.promise,
    );
    await act(async () => stream.resolve({ post_keys: memberIds, last_post_score: null }));
    await waitFor(() => expect(byIdsSpy.mock.calls.some(([p]) => p.post_ids.length === 10)).toBe(true));
    await act(async () =>
      batch.resolve(
        ids.map((id, i) => ({
          details: {
            id,
            author: AUTHOR,
            content: '',
            kind: 'short',
            uri: postUriBuilder(AUTHOR, id),
            indexed_at: 1,
            attachments: null,
          },
          counts: { replies: 0, tags: 0, unique_tags: 0, reposts: 0 },
          tags: [],
          bookmark: null,
          relationships: { replied: null, reposted: postUriBuilder(AUTHOR, originals[i]), mentioned: [] },
        })),
      ),
    );
    await waitFor(() => expect(userBatchSpy).toHaveBeenCalled());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    expect(byIdsSpy.mock.calls.filter(([p]) => p.post_ids.length === 1)).toHaveLength(0);
    expect(view.container.querySelectorAll('[data-cy="post-card"]')).toHaveLength(0);
    await act(async () => users.resolve([]));
    await waitFor(() =>
      expect(byIdsSpy).toHaveBeenCalledWith(expect.objectContaining({ post_ids: expectedOriginalIds })),
    );
    expect(byIdsSpy.mock.calls.filter(([p]) => p.post_ids.length === 1)).toHaveLength(0);
    expect(view.container.querySelectorAll('[data-cy="post-card"]')).toHaveLength(0);
    view.unmount();
    await act(async () => {
      users.resolve([]);
      originalResponses.resolve([]);
    });
  });
});
