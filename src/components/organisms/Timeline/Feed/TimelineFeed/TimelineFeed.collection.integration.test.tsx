import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { postUriBuilder } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { PostController } from '@/controllers/post/post';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import * as pullToRefresh from '@/hooks/usePullToRefresh/usePullToRefresh';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { PostSavePicker } from '@/organisms/PostSavePicker/PostSavePicker';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { LAYOUT } from '@/stores/home/home.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { TimelineFeed } from './TimelineFeed';

const route = vi.hoisted(() => ({ userId: '', postId: '' }));
vi.mock('next/navigation', () => ({
  useParams: () => route,
  usePathname: () => `/collections/${route.userId}/${route.postId}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// Replace rich post presentation only. Feed, picker, local queries, pagination,
// controllers and IndexedDB remain real; only remote IO is stubbed below.
vi.mock('@/organisms/Timeline/Posts/FeedItem/TimelineFeedItem', () => ({
  TimelineFeedItem: ({ postId }: { postId: string }) => (
    <article data-testid={postId}>
      <PostSavePicker postId={postId} buttonClassName="" />
    </article>
  ),
}));
vi.mock('@/molecules/Toaster/toast');

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
// Post ids are timestamps: creates in the same millisecond would share an id.
const nextTimestamp = () => new Promise((resolve) => setTimeout(resolve, 2));
const toUri = (compositeId: string) => {
  const { pubky, id } = parseCompositeId(compositeId);
  return postUriBuilder(pubky, id);
};

function ItemCount({ collectionId }: { collectionId: string }) {
  const { postDetails } = usePostDetails(collectionId);
  return <output data-testid="item-count">{parseCollectionContent(postDetails?.content ?? '')?.items?.length}</output>;
}

describe('collection feed with local membership', () => {
  beforeEach(() => {
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({ post_keys: [], last_post_score: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    postStreamQueue.clear();
    resetViewport();
  });

  async function seed(saved = true) {
    const postId = await PostController.commitCreate({ authorId: AUTHOR, content: 'Saved from home' });
    const { pubky, id } = parseCompositeId(postId);
    await nextTimestamp();
    const collectionId = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Reading list',
      items: saved ? [postUriBuilder(pubky, id)] : [],
    });
    route.userId = AUTHOR;
    route.postId = parseCompositeId(collectionId).id;
    return { postId, collectionId };
  }

  function showFeed(collectionId: string) {
    return render(
      <TimelineFeed
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        requestedLayout={LAYOUT.LIST}
        emptyState={<p>No saved posts</p>}
      >
        <ItemCount collectionId={collectionId} />
      </TimelineFeed>,
    );
  }

  const closePicker = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  const openPicker = async () => {
    const trigger = await screen.findByRole('button', { name: 'Save post' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await screen.findByText('Reading list');
  };

  function nexusEnvelope(collectionId: string, local: PostDetailsModelSchema, items: string[], indexedAt: number) {
    const { pubky, id } = parseCompositeId(collectionId);
    return {
      details: {
        id,
        author: pubky as Pubky,
        kind: local.kind,
        uri: local.uri,
        attachments: null,
        indexed_at: indexedAt,
        content: JSON.stringify({ ...JSON.parse(local.content), items: items.map(toUri) }),
      },
      counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
      tags: [],
      relationships: { replied: null, reposted: null, mentioned: [] },
      bookmark: null,
    };
  }

  // Observe the pull-to-refresh callback while keeping the real hook mounted.
  function observeRefresh() {
    const originalHook = pullToRefresh.usePullToRefresh;
    const refresh = { current: async () => {} };
    vi.spyOn(pullToRefresh, 'usePullToRefresh').mockImplementation(function useObservedPullToRefresh(options) {
      refresh.current = options.onRefresh;
      return originalHook(options);
    });
    return refresh;
  }

  it('renders the owner’s saved post and count on first navigation while Nexus is empty (#2235)', async () => {
    const postId = await PostController.commitCreate({ authorId: AUTHOR, content: 'Saved from home' });
    const picker = render(<PostSavePicker postId={postId} buttonClassName="" />);
    const trigger = screen.getByRole('button', { name: 'Save post' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.change(await screen.findByPlaceholderText('Collection name'), { target: { value: 'Reading list' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    const collections = await waitFor(async () => {
      const result = await PostController.getAuthoredCollections({ authorId: AUTHOR });
      expect(result).toHaveLength(1);
      return result!;
    });
    picker.unmount();
    const collectionId = collections[0].details.id;
    route.userId = AUTHOR;
    route.postId = parseCompositeId(collectionId).id;
    showFeed(collectionId);
    expect(await screen.findByTestId(postId)).toBeInTheDocument();
    expect(screen.getByTestId('item-count')).toHaveTextContent('1');
    await waitFor(() => expect(NexusPostStreamService.fetch).toHaveBeenCalled());
    expect(screen.queryByText('No saved posts')).not.toBeInTheDocument();
  });

  it('preserves the same card and open picker while refresh awaits a replacement page', async () => {
    const refresh = observeRefresh();
    const { collectionId, postId } = await seed();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [postId], last_post_score: null });
    showFeed(collectionId);
    await openPicker();
    const originalCard = screen.getByTestId(postId);
    // The open picker pages its own collections list through the same service; count
    // only this collection's item pages, or a slow run attributes that request to the refresh.
    const collectionPageRequests = () =>
      vi
        .mocked(NexusPostStreamService.fetch)
        .mock.calls.filter(([request]) => request.invokeEndpoint === StreamSource.COLLECTION).length;
    const before = collectionPageRequests();
    const replacement = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
    vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(replacement.promise);
    let refreshing: Promise<void> | undefined;
    act(() => {
      refreshing = refresh.current();
    });
    await waitFor(() => expect(collectionPageRequests()).toBe(before + 1));
    expect(screen.getByTestId(postId)).toBe(originalCard);
    expect(screen.getByText('Reading list')).toBeVisible();
    await act(async () => {
      replacement.resolve({ post_keys: [], last_post_score: null });
      await refreshing;
    });
    expect(screen.getByTestId(postId)).toBe(originalCard);
    expect(screen.getByText('Reading list')).toBeVisible();
  });

  it.each(['desktop', 'mobile'])(
    'retains the card until removal finishes after closing the %s picker',
    async (viewport) => {
      if (viewport === 'mobile') setMobileViewport();
      const { collectionId, postId } = await seed();
      showFeed(collectionId);
      await openPicker();
      const request = Promise.withResolvers<void>();
      vi.mocked(HomeserverService.request).mockReturnValueOnce(request.promise);

      fireEvent.click(screen.getByText('Reading list'));
      await waitFor(() => expect(screen.getByTestId('item-count')).toHaveTextContent('0'));
      expect(screen.getByTestId(postId)).toBeInTheDocument();
      closePicker();
      expect(screen.getByTestId(postId)).toBeInTheDocument();

      await act(async () => request.resolve());
      await waitFor(() => expect(screen.queryByTestId(postId)).not.toBeInTheDocument());
      expect(await screen.findByText('No saved posts')).toBeInTheDocument();
    },
  );

  it('keeps the card and restores its membership when a removal fails after the picker closes', async () => {
    const { collectionId, postId } = await seed();
    showFeed(collectionId);
    await openPicker();
    const originalCard = screen.getByTestId(postId);
    const request = Promise.withResolvers<void>();
    vi.mocked(HomeserverService.request).mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByText('Reading list'));
    await waitFor(() => expect(screen.getByTestId('item-count')).toHaveTextContent('0'));
    closePicker();
    await act(async () =>
      request.reject(
        Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Save failed', {
          service: ErrorService.Homeserver,
          operation: 'test-collection-removal',
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('item-count')).toHaveTextContent('1'));
    expect(screen.getByTestId(postId)).toBe(originalCard);
    await openPicker();
    closePicker();
    expect(screen.getByTestId(postId)).toBeInTheDocument();
  });

  it('keeps a completed removal visible until close and accepts a later save from another surface', async () => {
    const { collectionId, postId } = await seed();
    showFeed(collectionId);
    await openPicker();
    fireEvent.click(screen.getByText('Reading list'));
    await waitFor(() => expect(screen.getByTestId('item-count')).toHaveTextContent('0'));
    expect(screen.getByTestId(postId)).toBeInTheDocument();
    closePicker();
    await waitFor(() => expect(screen.queryByTestId(postId)).not.toBeInTheDocument());
    await act(async () => {
      await PostController.commitUpdateCollectionItem({ collectionId, postId, shouldAdd: true });
    });
    expect(await screen.findByTestId(postId)).toBeInTheDocument();
    expect(screen.getByTestId('item-count')).toHaveTextContent('1');
  });

  it('keeps the same card mounted when the owner removes then re-adds it before closing', async () => {
    const { collectionId, postId } = await seed();
    showFeed(collectionId);
    await openPicker();
    const originalCard = screen.getByTestId(postId);
    fireEvent.click(screen.getByText('Reading list'));
    await waitFor(() => expect(screen.getByTestId('item-count')).toHaveTextContent('0'));
    await waitFor(() =>
      expect(screen.getByText('Reading list').closest('[role="menuitem"]')).not.toHaveAttribute('data-disabled'),
    );
    fireEvent.click(screen.getByText('Reading list'));
    await waitFor(() => expect(screen.getByTestId('item-count')).toHaveTextContent('1'));
    closePicker();
    expect(screen.getByTestId(postId)).toBe(originalCard);
  });

  it('removes an optimistic addition when the homeserver rejects it', async () => {
    const { collectionId, postId } = await seed(false);
    showFeed(collectionId);
    await screen.findByText('No saved posts');
    const request = Promise.withResolvers<void>();
    vi.mocked(HomeserverService.request).mockReturnValueOnce(request.promise);
    const update = PostController.commitUpdateCollectionItem({ collectionId, postId, shouldAdd: true });
    const rejected = expect(update).rejects.toThrow('Save failed');
    expect(await screen.findByTestId(postId)).toBeInTheDocument();
    await act(async () =>
      request.reject(
        Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Save failed', {
          service: ErrorService.Homeserver,
          operation: 'test-collection-addition',
        }),
      ),
    );
    await rejected;
    await waitFor(() => expect(screen.queryByTestId(postId)).not.toBeInTheDocument());
    expect(screen.getByTestId('item-count')).toHaveTextContent('0');
  });
  it('shows the owner the stream error beside Add Content instead of an empty collection', async () => {
    const collectionId = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Reading list',
      items: [postUriBuilder(AUTHOR, '0000000000001')],
    });
    route.userId = AUTHOR;
    route.postId = parseCompositeId(collectionId).id;
    vi.mocked(NexusPostStreamService.fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <TimelineFeed
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        requestedLayout={LAYOUT.LIST}
        emptyState={<p>No saved posts</p>}
        trailingSlot={<button>Add content</button>}
      />,
    );
    expect(await screen.findByText(/^Error:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add content' })).toBeInTheDocument();
    expect(screen.queryByText('No saved posts')).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${AUTHOR}:0000000000001`)).not.toBeInTheDocument();
  });

  it('shows an item added on another device once pull-to-refresh refetches an envelope past the indexing window', async () => {
    const refresh = observeRefresh();
    const { collectionId, postId } = await seed();
    await nextTimestamp();
    const addedElsewhere = await PostController.commitCreate({ authorId: AUTHOR, content: 'Saved on my phone' });
    // The envelope was read two minutes ago: fresh for its TTL, but older than Nexus.
    await PostTtlModel.upsert({ id: collectionId, lastUpdatedAt: Date.now() - 120_000 });
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValue({
      post_keys: [postId, addedElsewhere],
      last_post_score: null,
    });
    showFeed(collectionId);
    expect(await screen.findByTestId(postId)).toBeInTheDocument();
    expect(screen.queryByTestId(addedElsewhere)).not.toBeInTheDocument();

    const local = (await PostController.getDetails({ compositeId: collectionId }))!;
    const byIds = vi
      .spyOn(NexusPostStreamService, 'fetchByIds')
      .mockImplementation(async ({ post_ids }) =>
        post_ids.includes(collectionId)
          ? [nexusEnvelope(collectionId, local, [postId, addedElsewhere], local.indexed_at + 1_000)]
          : [],
      );
    await act(async () => {
      await refresh.current();
    });
    expect(byIds).toHaveBeenCalledWith(expect.objectContaining({ post_ids: [collectionId], viewer_id: AUTHOR }));
    expect(await screen.findByTestId(addedElsewhere)).toBeInTheDocument();
    expect(screen.getByTestId('item-count')).toHaveTextContent('2');
  });

  it('keeps a save Nexus has not indexed yet when the owner pulls to refresh', async () => {
    const refresh = observeRefresh();
    const { collectionId, postId } = await seed();
    const indexed = (await PostController.getDetails({ compositeId: collectionId }))!;
    await nextTimestamp();
    const justSaved = await PostController.commitCreate({ authorId: AUTHOR, content: 'Saved a moment ago' });
    await PostController.commitUpdateCollectionItem({ collectionId, postId: justSaved, shouldAdd: true });
    // Nexus still serves the pre-save envelope, indexed after this device created it.
    const byIds = vi
      .spyOn(NexusPostStreamService, 'fetchByIds')
      .mockImplementation(async ({ post_ids }) =>
        post_ids.includes(collectionId)
          ? [nexusEnvelope(collectionId, indexed, [postId], indexed.indexed_at + 500)]
          : [],
      );
    showFeed(collectionId);
    expect(await screen.findByTestId(justSaved)).toBeInTheDocument();
    await act(async () => {
      await refresh.current();
    });
    expect(byIds).not.toHaveBeenCalledWith(expect.objectContaining({ post_ids: [collectionId] }));
    expect(screen.getByTestId(justSaved)).toBeInTheDocument();

    // The next save builds on the kept envelope, so the homeserver keeps both items.
    await nextTimestamp();
    const nextSave = await PostController.commitCreate({ authorId: AUTHOR, content: 'Saved next' });
    await PostController.commitUpdateCollectionItem({ collectionId, postId: nextSave, shouldAdd: true });
    const saved = JSON.stringify(vi.mocked(HomeserverService.request).mock.lastCall![0].bodyJson);
    expect(saved).toContain(toUri(justSaved));
    expect(saved).toContain(toUri(nextSave));
  });

  it('never requests a page while a fully cached collection is still loading its stream', async () => {
    // An always-intersecting viewport: an armed scroll sentinel would fire at once.
    class IntersectingObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback([asOpaque<IntersectionObserverEntry>({ isIntersecting: true, target })], this);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', IntersectingObserver);
    try {
      // A card counts as cached only with its author's details, as after any feed visit.
      await UserDetailsModel.upsert({
        id: AUTHOR,
        name: 'Author',
        bio: '',
        links: [],
        status: null,
        image: null,
        indexed_at: 1,
      });
      const { postId } = await seed();
      const firstPage = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
      vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(firstPage.promise);
      render(
        <TimelineFeed
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          requestedLayout={LAYOUT.LIST}
          emptyState={<p>No saved posts</p>}
          trailingSlot={<button>Add content</button>}
        />,
      );
      expect(await screen.findByTestId(postId)).toBeInTheDocument();
      const collectionPageRequests = () =>
        vi
          .mocked(NexusPostStreamService.fetch)
          .mock.calls.filter(([request]) => request.invokeEndpoint === StreamSource.COLLECTION).length;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(collectionPageRequests()).toBe(1);
      await act(async () => firstPage.resolve({ post_keys: [postId], last_post_score: null }));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(collectionPageRequests()).toBe(1);
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
