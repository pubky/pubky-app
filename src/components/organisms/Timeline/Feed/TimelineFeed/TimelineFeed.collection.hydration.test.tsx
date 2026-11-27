import { act, render, waitFor } from '@testing-library/react';
import { buildUri } from 'pubky-social-specs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { PostController } from '@/controllers/post/post';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { NexusUserService } from '@/services/nexus/user/user';
import { useAuthStore } from '@/stores/auth/auth.store';
import { LAYOUT } from '@/stores/home/home.types';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';

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
    stubMemoryHomeserver(AUTHOR);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    const ids = Array.from({ length: 50 }, (_, i) => `00000000${String(i).padStart(4, '0')}0`);
    const memberIds = ids.map((id) => `${AUTHOR}:${id}`);
    const collectionId = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Cold collection',
      items: ids.map((id) => buildUri(AUTHOR, 'post', id)),
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
  /** Ten cold reposts in a collection, rendered with their own hydration resolved up to the authors. */
  async function renderColdReposts() {
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    stubMemoryHomeserver(AUTHOR);
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
    const ids = Array.from({ length: 10 }, (_, i) => `00000000${String(i).padStart(4, '0')}0`);
    const memberIds = ids.map((id) => `${AUTHOR}:${id}`);
    const collectionId = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Cold collection',
      items: ids.map((id) => buildUri(AUTHOR, 'post', id)),
    });
    route.userId = AUTHOR;
    route.postId = parseCompositeId(collectionId).id;
    // Member rows and their originals are initially absent from the cache.
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
    const originals = ids.map((_id, i) => `00000001${String(i).padStart(4, '0')}0`);
    const expectedOriginalIds = originals.map((id) => `${AUTHOR}:${id}`);
    // The page's batch and every original read (the batch behind the page and each card's own) answer separately.
    const originalResponses = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetchByIds>>>();
    byIdsSpy.mockImplementation((p) =>
      p.post_ids.some((id) => memberIds.includes(id))
        ? batch.promise
        : originalResponses.promise.then((posts) =>
            posts.filter((post) => p.post_ids.includes(`${AUTHOR}:${post.details.id}`)),
          ),
    );
    await act(async () => stream.resolve({ post_keys: memberIds, last_post_score: null }));
    await waitFor(() => expect(byIdsSpy.mock.calls.some(([p]) => p.post_ids.length === 10)).toBe(true));
    const nexusPost = (
      id: string,
      content: string,
      reposted: string | null,
    ): Awaited<ReturnType<typeof NexusPostStreamService.fetchByIds>>[number] => ({
      details: {
        id,
        author: AUTHOR,
        content,
        kind: 'short',
        uri: buildUri(AUTHOR, 'post', id),
        indexed_at: 1,
        attachments: null,
      },
      counts: { replies: 0, tags: 0, unique_tags: 0, reposts: 0 },
      tags: [],
      bookmark: null,
      relationships: { replied: null, reposted, mentioned: [] },
    });
    await act(async () => batch.resolve(ids.map((id, i) => nexusPost(id, '', buildUri(AUTHOR, 'post', originals[i])))));
    await waitFor(() => expect(userBatchSpy).toHaveBeenCalled());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    // The authors belong to the page: its cards wait for them.
    expect(view.container.querySelectorAll('[data-cy="post-card"]')).toHaveLength(0);
    await act(async () => users.resolve([]));
    const cards = () => [...view.container.querySelectorAll('[data-cy="post-card"]')];
    // The originals do not: the cards mount before they answer.
    await waitFor(() => expect(cards()).toHaveLength(10));
    await waitFor(() =>
      expect(byIdsSpy).toHaveBeenCalledWith(expect.objectContaining({ post_ids: expectedOriginalIds })),
    );
    for (const card of cards()) {
      expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
      expect(card.textContent).not.toContain('Post not found.');
    }
    const originalPosts = originals.map((id, i) => nexusPost(id, `original ${i}`, null));
    return { view, cards, originalResponses, originalPosts };
  }

  it('mounts cold repost cards before their originals, each showing its original once it arrives', async () => {
    const { view, cards, originalResponses, originalPosts } = await renderColdReposts();
    const mounted = cards();

    await act(async () => originalResponses.resolve(originalPosts));

    // The batch behind the page and each card's own read persist these posts side by side.
    await waitFor(
      () => {
        originalPosts.forEach((_post, i) => expect(view.container.textContent).toContain(`original ${i}`));
      },
      { timeout: 10_000 },
    );
    // The same cards, filled in place.
    expect(cards()).toEqual(mounted);
    expect(view.container.textContent).not.toContain('Post not found.');
    view.unmount();
  });

  it('ends a repost card on not found when the source has no original', async () => {
    const { view, cards, originalResponses } = await renderColdReposts();

    await act(async () => originalResponses.resolve([]));

    await waitFor(
      () => {
        for (const card of cards()) expect(card.textContent).toContain('Post not found.');
      },
      { timeout: 10_000 },
    );
    view.unmount();
  });
});
