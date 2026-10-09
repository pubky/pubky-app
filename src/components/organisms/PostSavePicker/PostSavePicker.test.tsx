import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { TimelineFeedContextValue } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { PostSavePicker } from './PostSavePicker';

const OTHER_AUTHOR = 'other-author';
const OTHER_COLLECTION_1 = `${OTHER_AUTHOR}:collection-a`;
const OTHER_COLLECTION_2 = `${OTHER_AUTHOR}:collection-b`;
const OTHER_COLLECTION_ENVELOPES: Record<string, string> = {
  [OTHER_COLLECTION_1]: JSON.stringify({
    name: 'Bitcoin Industry',
    items: ['pubky://author/pub/pubky.app/posts/post1'],
  }),
  [OTHER_COLLECTION_2]: JSON.stringify({ name: "John's Quotes", items: ['pubky://author/pub/pubky.app/posts/post1'] }),
};

const mockState = vi.hoisted(() => ({
  isMobile: false,
  isBookmarked: true,
  isBookmarkLoading: false,
  isBookmarkToggling: false,
  isCollectionsLoading: false,
  hasMoreCollections: false,
  isCollectionsLoadingMore: false,
  isStalled: false,
  collection1Saved: true,
  collection1Updating: false,
  collectionsCount: 0,
  otherCollectionIds: [] as string[],
  isOtherCollectionsLoading: false,
  hasMoreOtherCollections: false,
  isOtherCollectionsLoadingMore: false,
  loadMoreOtherCollections: vi.fn(),
  toggleBookmark: vi.fn(),
  toggleCollection: vi.fn(),
  createCollectionWithPost: vi.fn(),
  loadMoreCollections: vi.fn(),
  resumeAutoLoad: vi.fn(),
  setShowSignInDialog: vi.fn(),
}));
vi.mock('@/hooks/usePostSaveTargets/usePostSaveTargets', () => ({
  usePostSaveTargets: () => ({
    isBookmarked: mockState.isBookmarked,
    isBookmarkLoading: mockState.isBookmarkLoading,
    isBookmarkToggling: mockState.isBookmarkToggling,
    collections: [
      {
        id: 'author:collection1',
        name: 'Proof of Work',
        description: 'Bitcoin writing',
        isSaved: mockState.collection1Saved,
        isUpdating: mockState.collection1Updating,
      },
      {
        id: 'author:collection2',
        name: 'AI Papers',
        description: '',
        isSaved: false,
        isUpdating: false,
      },
    ],
    isCollectionsLoading: mockState.isCollectionsLoading,
    isCreatingCollection: false,
    hasMoreCollections: mockState.hasMoreCollections,
    isCollectionsLoadingMore: mockState.isCollectionsLoadingMore,
    loadMoreCollections: mockState.loadMoreCollections,
    otherCollectionIds: mockState.otherCollectionIds,
    isOtherCollectionsLoading: mockState.isOtherCollectionsLoading,
    hasMoreOtherCollections: mockState.hasMoreOtherCollections,
    isOtherCollectionsLoadingMore: mockState.isOtherCollectionsLoadingMore,
    loadMoreOtherCollections: mockState.loadMoreOtherCollections,
    toggleBookmark: mockState.toggleBookmark,
    toggleCollection: mockState.toggleCollection,
    createCollectionWithPost: mockState.createCollectionWithPost,
  }),
}));

// The stalled state is the real hook's own budget outcome (see its test file); here it is
// forced so the fallback control the picker renders for it can be exercised directly.
vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: () => ({
    sentinelRef: { current: null },
    isStalled: mockState.isStalled,
    resumeAutoLoad: mockState.resumeAutoLoad,
  }),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockState.isMobile,
}));

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: () => ({
    postCounts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0, collections: mockState.collectionsCount },
    isLoading: false,
  }),
}));

// The "Also in collections" rows read their envelope from the local post row the
// stream layer hydrated; only the two fixture collections resolve here.
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: (compositeId: string) => {
    const content = OTHER_COLLECTION_ENVELOPES[compositeId];
    return {
      postDetails: content ? { id: compositeId, content, kind: 'collection' } : null,
      isLoading: false,
    };
  },
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: (userId: string) => ({
    profile: userId === OTHER_AUTHOR ? { name: 'Satoshi', publicKey: userId, avatarUrl: undefined } : null,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
}));

// Both shapes are needed: the picker's auth gate reads `getState()`, while the
// author avatars in the also-in rows call the store as a selector hook.
vi.mock('@/stores/auth/auth.store', async () => {
  const { createZustandLikeHook, mockAuthStore } = await import('@/test-utils/stores');
  return {
    useAuthStore: createZustandLikeHook(
      mockAuthStore({ currentUserPubky: 'current-user', setShowSignInDialog: mockState.setShowSignInDialog }),
    ),
  };
});

// The also-in rows own a viewport TTL subscription; the coordinator is not under test here.
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: () => ({ ref: () => {}, isVisible: false }),
}));
const TEST_STREAM_ID = 'timeline:all:all' as PostStreamId;

const resetMockState = () => {
  vi.clearAllMocks();
  mockState.isMobile = false;
  mockState.isBookmarked = true;
  mockState.isBookmarkLoading = false;
  mockState.isBookmarkToggling = false;
  mockState.isCollectionsLoading = false;
  mockState.collection1Saved = true;
  mockState.collection1Updating = false;
  mockState.hasMoreCollections = false;
  mockState.isCollectionsLoadingMore = false;
  mockState.isStalled = false;
  mockState.collectionsCount = 0;
  mockState.otherCollectionIds = [];
  mockState.isOtherCollectionsLoading = false;
  mockState.hasMoreOtherCollections = false;
  mockState.isOtherCollectionsLoadingMore = false;
};

const renderPicker = (feedContext?: TimelineFeedContextValue) => {
  const createPicker = () => {
    const picker = (
      <PostSavePicker
        postId="author:post1"
        buttonClassName="border-none shadow-xs"
        countClassName="text-xs leading-4 font-bold text-muted-foreground"
      />
    );
    return feedContext ? (
      <TimelineFeedContext.Provider value={feedContext}>{picker}</TimelineFeedContext.Provider>
    ) : (
      picker
    );
  };
  const result = render(createPicker());
  return { ...result, rerenderPicker: () => result.rerender(createPicker()) };
};

const getTriggerIcon = (container: HTMLElement) => {
  const icon = container.querySelector('[data-cy="post-save-trigger-icon"]');
  if (!(icon instanceof HTMLElement)) {
    throw new Error('Expected post save trigger icon to render');
  }
  return icon;
};

const openPicker = () => {
  // The accessible name carries the collections count when there is one.
  const trigger = screen.getByRole('button', { name: /^Save post/ });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
};

const closePicker = () => {
  // Escape dismisses the Radix dropdown, which drives onOpenChange(false).
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
};

describe('PostSavePicker', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('opens the desktop save menu with bookmarks and collections', async () => {
    renderPicker();

    openPicker();

    await waitFor(() => {
      expect(screen.getByText('Bookmarks')).toBeInTheDocument();
      expect(screen.getByText('Proof of Work')).toBeInTheDocument();
      expect(screen.getByText('AI Papers')).toBeInTheDocument();
    });
  });

  it('shows the default collection icon when the post is not in bookmarks or any collection', () => {
    mockState.isBookmarked = false;
    mockState.collection1Saved = false;
    const { container } = renderPicker();

    expect(getTriggerIcon(container)).toHaveAttribute('data-state', 'default');
  });

  it('shows the saved collection icon when the post belongs to a collection', () => {
    mockState.collection1Saved = true;
    const { container } = renderPicker();

    expect(getTriggerIcon(container)).toHaveAttribute('data-state', 'saved');
    expect(container.querySelector('.lucide-square-library')).toHaveClass('text-brand');
  });

  it('keeps the collection icon while the desktop save menu is open', async () => {
    const { container } = renderPicker();

    openPicker();

    await waitFor(() => {
      expect(screen.getByText('Bookmarks')).toBeInTheDocument();
    });
    expect(getTriggerIcon(container)).toHaveAttribute('data-state', 'saved');
  });

  it('shows the saved collection icon for bookmarked posts without collection membership', () => {
    mockState.isBookmarked = true;
    mockState.collection1Saved = false;
    const { container } = renderPicker();

    expect(getTriggerIcon(container)).toHaveAttribute('data-state', 'saved');
  });

  it('shows the collected icon in the foreground colour when only other users curate the post', () => {
    mockState.isBookmarked = false;
    mockState.collection1Saved = false;
    mockState.collectionsCount = 2;
    const { container } = renderPicker();

    expect(getTriggerIcon(container)).toHaveAttribute('data-state', 'collected');
    expect(container.querySelector('.lucide-square-library')).toHaveClass('text-foreground');
    expect(container.querySelector('.lucide-square-library')).not.toHaveClass('text-brand');
  });

  it('keeps the saved icon over the collected one when the viewer also saved the post', () => {
    mockState.isBookmarked = false;
    mockState.collection1Saved = true;
    mockState.collectionsCount = 3;
    const { container } = renderPicker();

    expect(getTriggerIcon(container)).toHaveAttribute('data-state', 'saved');
    expect(container.querySelector('.lucide-square-library')).toHaveClass('text-brand');
  });

  it('shows how many collections the post is part of on the trigger', () => {
    mockState.collectionsCount = 3;
    const { container } = renderPicker();

    const trigger = screen.getByRole('button', { name: 'Save post (3)' });
    expect(trigger).not.toHaveClass('w-10');
    expect(container.querySelector('[data-cy="post-save-collections-count"]')).toHaveTextContent('3');
    expect(container.querySelector('[data-cy="post-save-collections-count"]')).toHaveClass('text-xs');
  });

  it('renders an icon-only trigger while no collection holds the post', () => {
    mockState.collectionsCount = 0;
    const { container } = renderPicker();

    expect(screen.getByRole('button', { name: 'Save post' })).toHaveClass('w-10');
    expect(container.querySelector('[data-cy="post-save-collections-count"]')).not.toBeInTheDocument();
  });

  it("lists other users' collections that contain the post as links to them", async () => {
    mockState.otherCollectionIds = [OTHER_COLLECTION_1, OTHER_COLLECTION_2];
    renderPicker();

    openPicker();

    expect(await screen.findByText('Also in collections:')).toBeInTheDocument();
    const first = screen.getByText('Bitcoin Industry').closest('a');
    expect(first).toHaveAttribute('href', `/collections/${OTHER_AUTHOR}/collection-a`);
    expect(first).toHaveAttribute('role', 'menuitem');
    expect(screen.getByText("John's Quotes").closest('a')).toHaveAttribute(
      'href',
      `/collections/${OTHER_AUTHOR}/collection-b`,
    );
    expect(screen.getAllByTestId('post-save-other-collection-avatar')).toHaveLength(2);
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('skips an other-user collection whose envelope cannot be read', async () => {
    mockState.otherCollectionIds = [OTHER_COLLECTION_1, `${OTHER_AUTHOR}:unreadable`];
    renderPicker();

    openPicker();

    await screen.findByText('Also in collections:');
    const rows = document.querySelectorAll('[data-cy="post-save-other-collection"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('href', `/collections/${OTHER_AUTHOR}/collection-a`);
  });

  it("keeps the also-in Load more reachable when the first page held only the viewer's collections", async () => {
    mockState.otherCollectionIds = [];
    mockState.hasMoreOtherCollections = true;
    renderPicker();

    openPicker();

    expect(await screen.findByText('Also in collections:')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Load more'));
    expect(mockState.loadMoreOtherCollections).toHaveBeenCalledTimes(1);
  });

  it('hides the also-in section while no other collection contains the post', async () => {
    renderPicker();

    openPicker();
    await screen.findByText('Bookmarks');

    expect(screen.queryByText('Also in collections:')).not.toBeInTheDocument();
  });

  it('shows the also-in section loading state while the first page is in flight', async () => {
    mockState.isOtherCollectionsLoading = true;
    renderPicker();

    openPicker();

    expect(await screen.findByText('Also in collections:')).toBeInTheDocument();
    expect(screen.getAllByText('Loading collections...')).toHaveLength(1);
  });

  it('loads more other collections from the also-in Load more row', async () => {
    mockState.otherCollectionIds = [OTHER_COLLECTION_1];
    mockState.hasMoreOtherCollections = true;
    renderPicker();

    openPicker();
    fireEvent.click(await screen.findByText('Load more'));

    expect(mockState.loadMoreOtherCollections).toHaveBeenCalledTimes(1);
    expect(mockState.loadMoreCollections).not.toHaveBeenCalled();
  });

  it('renders other collections as plain links in the mobile sheet', async () => {
    mockState.isMobile = true;
    mockState.otherCollectionIds = [OTHER_COLLECTION_1];
    renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Save post' }));

    const link = (await screen.findByText('Bitcoin Industry')).closest('a');
    expect(link).toHaveAttribute('href', `/collections/${OTHER_AUTHOR}/collection-a`);
    expect(link).not.toHaveAttribute('role', 'menuitem');

    // A same-route tap keeps the page mounted, so the row closes the sheet itself.
    fireEvent.click(link!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('toggles bookmark and collection targets from the desktop menu', async () => {
    renderPicker();

    openPicker();

    fireEvent.click(await screen.findByText('Bookmarks'));
    expect(mockState.toggleBookmark).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Proof of Work'));
    expect(mockState.toggleCollection).toHaveBeenCalledWith('author:collection1');
  });

  it('creates a collection from the inline field', async () => {
    renderPicker();

    openPicker();
    fireEvent.change(await screen.findByPlaceholderText('Collection name'), { target: { value: 'Reading list' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    });

    expect(mockState.createCollectionWithPost).toHaveBeenCalledWith('Reading list');
  });

  it('keeps inline field keyboard events from bubbling to the menu', async () => {
    const keyDownListener = vi.fn();

    renderPicker();

    openPicker();
    const input = await screen.findByPlaceholderText('Collection name');

    document.addEventListener('keydown', keyDownListener);

    try {
      fireEvent.keyDown(input, { key: 'V', code: 'KeyV', metaKey: true });
      fireEvent.keyDown(input, { key: 'V', code: 'KeyV' });

      expect(keyDownListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', keyDownListener);
    }
  });

  it('uses a bottom sheet on mobile', async () => {
    mockState.isMobile = true;

    renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Save post' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Save post')).toBeInTheDocument();
    });
    expect(screen.queryByText('Choose where this post should be saved.')).not.toBeInTheDocument();
  });

  it('removes the post from the bookmarks grid when the picker closes after unbookmarking', async () => {
    const removePosts = vi.fn();

    renderPicker({
      variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Bookmarks');

    mockState.isBookmarked = false;
    closePicker();

    expect(removePosts).toHaveBeenCalledWith('author:post1');
  });

  it('removes the post from the bookmarks grid after an in-flight unbookmark resolves', async () => {
    const removePosts = vi.fn();
    const { rerenderPicker } = renderPicker({
      variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Bookmarks');

    mockState.isBookmarked = false;
    mockState.isBookmarkToggling = true;
    closePicker();

    expect(removePosts).not.toHaveBeenCalled();

    mockState.isBookmarkToggling = false;
    rerenderPicker();

    expect(removePosts).toHaveBeenCalledWith('author:post1');
  });

  it('keeps the post in the bookmarks grid when it is still bookmarked on close', async () => {
    const removePosts = vi.fn();
    mockState.isBookmarked = true;

    renderPicker({
      variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Bookmarks');

    closePicker();

    expect(removePosts).not.toHaveBeenCalled();
  });

  it('removes the post from the collection grid when the picker closes after removing it from the current collection', async () => {
    const removePosts = vi.fn();

    renderPicker({
      variant: TIMELINE_FEED_VARIANT.COLLECTION,
      collectionId: 'author:collection1',
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Proof of Work');

    mockState.collection1Saved = false;
    closePicker();

    expect(removePosts).toHaveBeenCalledWith('author:post1');
  });

  it('removes the post from the collection grid after an in-flight collection removal resolves', async () => {
    const removePosts = vi.fn();
    const { rerenderPicker } = renderPicker({
      variant: TIMELINE_FEED_VARIANT.COLLECTION,
      collectionId: 'author:collection1',
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Proof of Work');

    mockState.collection1Saved = false;
    mockState.collection1Updating = true;
    closePicker();

    expect(removePosts).not.toHaveBeenCalled();

    mockState.collection1Updating = false;
    rerenderPicker();

    expect(removePosts).toHaveBeenCalledWith('author:post1');
  });

  it('keeps the post in the collection grid when it still belongs to the current collection on close', async () => {
    const removePosts = vi.fn();

    renderPicker({
      variant: TIMELINE_FEED_VARIANT.COLLECTION,
      collectionId: 'author:collection1',
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Proof of Work');

    closePicker();

    expect(removePosts).not.toHaveBeenCalled();
  });

  it('does not remove the post while the bookmark state is still resolving', async () => {
    const removePosts = vi.fn();
    // Mirrors useBookmark's initial state: not yet resolved, seeded as not bookmarked.
    mockState.isBookmarked = false;
    mockState.isBookmarkLoading = true;

    renderPicker({
      variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Bookmarks');

    closePicker();

    expect(removePosts).not.toHaveBeenCalled();
  });

  it('does not remove the post on non-bookmarks feeds even when unbookmarked', async () => {
    const removePosts = vi.fn();
    mockState.isBookmarked = false;

    renderPicker({
      variant: TIMELINE_FEED_VARIANT.HOME,
      streamId: TEST_STREAM_ID,
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts,
    });

    openPicker();
    await screen.findByText('Bookmarks');

    closePicker();

    expect(removePosts).not.toHaveBeenCalled();
  });

  it('reaches the stalled Load more control from the keyboard and keeps the menu open', async () => {
    mockState.hasMoreCollections = true;
    mockState.isStalled = true;

    renderPicker();
    openPicker();

    // Arrow/Home/End navigation inside a Radix menu only visits registered menu items.
    const loadMore = await screen.findByRole('menuitem', { name: 'Load more' });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'End', code: 'End' });
    expect(loadMore).toHaveFocus();

    fireEvent.click(loadMore);

    expect(mockState.resumeAutoLoad).toHaveBeenCalledTimes(1);
    // The picker stays open so the revealed collections can be picked.
    expect(screen.getByText('Bookmarks')).toBeInTheDocument();
  });

  it('renders the stalled Load more control as a plain button in the mobile sheet', async () => {
    mockState.isMobile = true;
    mockState.hasMoreCollections = true;
    mockState.isStalled = true;

    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Save post' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(mockState.resumeAutoLoad).toHaveBeenCalledTimes(1);
  });
});
