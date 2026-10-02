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
import { PostSavePicker } from '@/organisms/PostSavePicker/PostSavePicker';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { LAYOUT } from '@/stores/home/home.types';
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
    const originalHook = pullToRefresh.usePullToRefresh;
    let refresh = async () => {};
    // Observe the callback while keeping the real pull-to-refresh hook mounted.
    vi.spyOn(pullToRefresh, 'usePullToRefresh').mockImplementation(function useObservedPullToRefresh(options) {
      refresh = options.onRefresh;
      return originalHook(options);
    });
    const { collectionId, postId } = await seed();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [postId], last_post_score: null });
    showFeed(collectionId);
    await openPicker();
    const originalCard = screen.getByTestId(postId);
    const before = vi.mocked(NexusPostStreamService.fetch).mock.calls.length;
    const replacement = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
    vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(replacement.promise);
    let refreshing: Promise<void> | undefined;
    act(() => {
      refreshing = refresh();
    });
    await waitFor(() => expect(NexusPostStreamService.fetch).toHaveBeenCalledTimes(before + 1));
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
});
