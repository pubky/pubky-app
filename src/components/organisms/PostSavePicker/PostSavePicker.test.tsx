import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { TimelineFeedContextValue } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { PostSavePicker } from './PostSavePicker';

const mockState = vi.hoisted(() => ({
  isMobile: false,
  isBookmarked: true,
  isBookmarkLoading: false,
  isBookmarkToggling: false,
  isCollectionsLoading: false,
  collection1Saved: true,
  collection1Updating: false,
  toggleBookmark: vi.fn(),
  toggleCollection: vi.fn(),
  createCollectionWithPost: vi.fn(),
  setShowSignInDialog: vi.fn(),
}));

const translations: Record<string, string> = {
  'postSave.title': 'Save post',
  'postSave.description': 'Choose where this post should be saved.',
  'postSave.open': 'Save post',
  'postSave.loading': 'Loading save options',
  'postSave.bookmarks': 'Bookmarks',
  'postSave.newCollection': 'New Collection',
  'postSave.collectionNamePlaceholder': 'Collection name',
  'postSave.createCollection': 'Create collection',
  'postSave.loadingCollections': 'Loading collections...',
};

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
    toggleBookmark: mockState.toggleBookmark,
    toggleCollection: mockState.toggleCollection,
    createCollectionWithPost: mockState.createCollectionWithPost,
  }),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockState.isMobile,
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      currentUserPubky: 'current-user',
      setShowSignInDialog: mockState.setShowSignInDialog,
    }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      translations[`${namespace}.${key}`] ?? key,
}));

const TEST_STREAM_ID = 'timeline:all:all' as PostStreamId;

describe('PostSavePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isMobile = false;
    mockState.isBookmarked = true;
    mockState.isBookmarkLoading = false;
    mockState.isBookmarkToggling = false;
    mockState.isCollectionsLoading = false;
    mockState.collection1Saved = true;
    mockState.collection1Updating = false;
  });

  const renderPicker = (feedContext?: TimelineFeedContextValue) => {
    const createPicker = () => {
      const picker = <PostSavePicker postId="author:post1" buttonClassName="border-none shadow-xs" />;
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
    const trigger = screen.getByRole('button', { name: 'Save post' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
  };

  const closePicker = () => {
    // Escape dismisses the Radix dropdown, which drives onOpenChange(false).
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
  };

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

  it('matches desktop picker snapshot when open', async () => {
    renderPicker();

    openPicker();

    await screen.findByText('Bookmarks');

    expect(document.body).toMatchSnapshot();
  });
});
