import { act, fireEvent, render, screen } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_MY_SECTION_SKELETON_COUNT, COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { FileController } from '@/controllers/file/file';
import { PostController } from '@/controllers/post/post';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { Pubky } from '@/models/models.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { MyCollections } from './MyCollections';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockLocalAvatarUrl: string | null | undefined = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

// `DialogNewCollection` (rendered via the header button and `NewCollectionCardCTA`)
// reads the viewer's authored collections to gate the onboarding intro. Stub it so
// it doesn't register its own `useLiveQuery` call, which would otherwise clobber the
// deleted-filter live query this suite captures.
vi.mock('@/hooks/useAuthoredCollections/useAuthoredCollections', () => ({
  useAuthoredCollections: () => ({ collections: [], isLoading: false }),
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getDetailsByIds: vi.fn().mockResolvedValue([]),
    commitCreateCollection: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: (selector: (state: { profile: string | null | undefined }) => unknown) =>
    selector({ profile: mockLocalAvatarUrl }),
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((pubky: string, indexedAt: number | string | undefined) => `avatar:${pubky}:${indexedAt}`),
  },
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    fallbackSeed,
    size,
    alt,
  }: {
    avatarUrl?: string;
    name: string;
    fallbackSeed?: string;
    size?: string;
    alt?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-avatar-url={avatarUrl ?? ''}
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-size={size}
      data-alt={alt}
    >
      {name}
    </div>
  ),
}));

vi.mock('@/organisms/Collections/CollectionBookmarkCard/CollectionBookmarkCard', () => ({
  CollectionBookmarkCard: () => <div data-testid="collection-bookmark-card" />,
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => ({
  CollectionCard: ({ authorPubky, postId }: { authorPubky: string; postId: string }) => (
    <div data-testid="collection-card" data-author-pubky={authorPubky} data-post-id={postId} />
  ),
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard.skeleton', () => ({
  CollectionCardSkeleton: () => <div data-testid="collection-card-skeleton" />,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy' }),
}));

vi.mock('@/molecules/AvatarStack/AvatarStack.skeleton', () => ({
  AvatarStackSkeleton: ({ count, size }: { count: number; size?: string }) => (
    <div data-testid="avatar-stack-skeleton" data-count={count} data-size={size} />
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const CURRENT_USER_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const AUTHOR_A = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);
const mockUseStreamPagination = vi.mocked(useStreamPagination);
const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);

type UserDetailsFixture = {
  name?: string;
  image?: string | null;
  indexed_at?: number;
} | null;

const defaultPagination = {
  postIds: [] as string[],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  prependPosts: vi.fn(),
  prependOptimisticPosts: vi.fn(),
  removePosts: vi.fn(),
  removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
};

function setup({
  userDetails = null,
  currentUserPubky = null,
  localAvatarUrl = null,
  pagination = {},
}: {
  userDetails?: UserDetailsFixture;
  currentUserPubky?: string | null;
  localAvatarUrl?: string | null;
  pagination?: Partial<typeof defaultPagination>;
} = {}) {
  mockLocalAvatarUrl = localAvatarUrl;
  mockUseCurrentUserProfile.mockReturnValue({
    userDetails: userDetails ? asOpaque<NexusUserDetails>(userDetails) : null,
    currentUserPubky: currentUserPubky ? asOpaque<Pubky>(currentUserPubky) : null,
  });
  mockUseStreamPagination.mockReturnValue({ ...defaultPagination, ...pagination });
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MyCollections', () => {
  it('renders signed-out fallback: title + AvatarStackSkeleton + pinned card, no CollectionCard items, no stream call', () => {
    setup({ currentUserPubky: null });

    render(<MyCollections />);

    expect(screen.getByText('My Collections')).toBeInTheDocument();
    const skeleton = screen.getByTestId('avatar-stack-skeleton');
    expect(skeleton).toHaveAttribute('data-count', '1');
    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Collection' })).not.toBeInTheDocument();
    expect(mockUseStreamPagination).not.toHaveBeenCalled();
  });

  it('renders authenticated empty state: title + AvatarWithFallback header + pinned card; no skeletons, no Show More', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 7 },
      pagination: { postIds: [], loading: false, hasMore: false },
    });

    render(<MyCollections />);

    expect(screen.getByText('My Collections')).toBeInTheDocument();
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Alice');
    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Collection' })).toHaveAttribute(
      'data-cy',
      'new-collection-card-cta',
    );
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-card-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  it('renders one CollectionCard per stream post id with parsed author/postId; no Show More when hasMore=false', () => {
    const ids = [`${AUTHOR_A}:p1`, `${AUTHOR_A}:p2`];
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: {
        postIds: ids,
        loading: false,
        hasMore: false,
      },
    });
    // Resolved live query, no tombstones → echoes `postIds`.
    vi.mocked(useLiveQuery).mockReturnValue(ids);

    render(<MyCollections />);

    const cards = screen.getAllByTestId('collection-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-author-pubky', AUTHOR_A);
    expect(cards[0]).toHaveAttribute('data-post-id', 'p1');
    expect(cards[1]).toHaveAttribute('data-author-pubky', AUTHOR_A);
    expect(cards[1]).toHaveAttribute('data-post-id', 'p2');
    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Collection' })).toHaveAttribute(
      'data-cy',
      'new-collection-card-cta',
    );
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  it('renders skeletons next to the pinned card on cold load (loading=true, empty postIds)', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: { postIds: [], loading: true, hasMore: false },
    });

    render(<MyCollections />);

    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.getAllByTestId('collection-card-skeleton')).toHaveLength(COLLECTIONS_MY_SECTION_SKELETON_COUNT);
    expect(screen.getByRole('button', { name: 'New Collection' })).toHaveAttribute(
      'data-cy',
      'new-collection-card-cta',
    );
  });

  it('does NOT render skeletons on warm-cache load (loading=true, postIds non-empty)', () => {
    const ids = [`${AUTHOR_A}:p1`];
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: {
        postIds: ids,
        loading: true,
        hasMore: false,
      },
    });
    // Resolved live query, no tombstones → echoes `postIds`.
    vi.mocked(useLiveQuery).mockReturnValue(ids);

    render(<MyCollections />);

    expect(screen.queryByTestId('collection-card-skeleton')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('collection-card')).toHaveLength(1);
  });

  it('renders Show More button (with i18n text) when hasMore=true & loading=false, and clicking it calls loadMore', () => {
    const loadMore = vi.fn();
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: {
        postIds: [`${AUTHOR_A}:p1`],
        loading: false,
        hasMore: true,
        loadMore,
      },
    });

    render(<MyCollections />);

    const button = screen.getByRole('button', { name: 'Show more' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('disables the Show More button and renders an animate-spin spinner when loadingMore=true', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: {
        postIds: [`${AUTHOR_A}:p1`],
        loading: false,
        hasMore: true,
        loadingMore: true,
      },
    });

    const { container } = render(<MyCollections />);

    const button = container.querySelector('button[disabled]');
    expect(button).not.toBeNull();
    expect(button?.querySelector('.animate-spin')).not.toBeNull();
    // The showMore label stays visible alongside the spinner during loading.
    expect(screen.getByText('Show more')).toBeInTheDocument();
  });

  it('passes buildAuthorCollectionsStreamId(currentUserPubky) + COLLECTIONS_SECTION_PAGE_SIZE to useStreamPagination', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
    });

    render(<MyCollections />);

    expect(mockUseStreamPagination).toHaveBeenCalledWith({
      streamId: buildAuthorCollectionsStreamId(asOpaque<Pubky>(CURRENT_USER_PUBKY)),
      limit: COLLECTIONS_SECTION_PAGE_SIZE,
      // `onError` is wired up to surface a load-failed toast on
      // stream failures (sibling sections fire the same toast inline). We
      // only assert its presence here — the toast behaviour itself is
      // covered by the next test.
      onError: expect.any(Function),
    });
  });

  it('fires a load-failed toast when useStreamPagination invokes onError', async () => {
    // Capture the onError handler the component passes into the hook, then
    // invoke it ourselves to simulate a stream slice failure. This proves the
    // wiring without needing to drive a real fetch through the hook mock.
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 7 },
    });
    // `setup()` calls `mockReturnValue`, so install the capturing
    // implementation AFTER it so we read the real `opts.onError`.
    let capturedOnError: ((error: unknown) => void) | undefined;
    mockUseStreamPagination.mockImplementation((opts) => {
      capturedOnError = opts.onError;
      return defaultPagination;
    });

    render(<MyCollections />);

    expect(typeof capturedOnError).toBe('function');

    await act(async () => {
      capturedOnError!(new Error('network down'));
    });

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to load collections. Please try again.',
    });
  });

  describe('deleted-filter live query', () => {
    // Defense-in-depth: `LocalPostService.delete`'s soft-delete branch keeps
    // the id in the author's collection PostStream, so a redirect from
    // `CollectionHero` would otherwise re-mount this section with the
    // deleted id still present. The live query observes `post_details` so
    // the filter reacts the moment the tombstone lands.
    it('drops postIds whose local PostDetails content is the [DELETED] tombstone', async () => {
      const ids = [
        `${AUTHOR_A}:p1`,
        `${AUTHOR_A}:p2`, // tombstoned
        `${AUTHOR_A}:p3`,
      ];
      setup({
        currentUserPubky: CURRENT_USER_PUBKY,
        userDetails: { name: 'Alice', image: null, indexed_at: 1 },
        pagination: { postIds: ids },
      });
      vi.mocked(PostController.getDetailsByIds).mockResolvedValue([
        asOpaque<PostDetailsModelSchema>({ id: ids[0], kind: 'collection', content: 'live' }),
        asOpaque<PostDetailsModelSchema>({ id: ids[1], kind: 'collection', content: '[DELETED]' }),
        asOpaque<PostDetailsModelSchema>({ id: ids[2], kind: 'collection', content: 'live' }),
      ]);

      // Capture the function `useLiveQuery` receives, invoke it ourselves,
      // and use the returned filtered list as `visibleIds` (mirrors the
      // pattern used in FollowedCollections / DiscoverCollections tests).
      let capturedFn: (() => Promise<string[]>) | null = null;
      vi.mocked(useLiveQuery).mockImplementation((fn: unknown) => {
        capturedFn = fn as () => Promise<string[]>;
        return undefined;
      });

      await act(async () => {
        render(<MyCollections />);
      });

      expect(capturedFn).not.toBeNull();
      const result = await capturedFn!();
      expect(result).toEqual([ids[0], ids[2]]);
      expect(result).not.toContain(ids[1]);
    });

    it('renders no CollectionCards while the live query is still resolving (`?? EMPTY_IDS` fallback)', () => {
      // `useLiveQuery` returns `undefined` until the first read settles.
      // We fall back to an empty list (matching `FollowedCollections`) rather
      // than the unfiltered `postIds` so the section never flashes a
      // `CollectionDeleted` molecule for a tombstoned id during that window.
      // Only the pinned `CollectionBookmarkCard` is visible until the filter
      // resolves.
      const ids = [`${AUTHOR_A}:p1`, `${AUTHOR_A}:p2`];
      setup({
        currentUserPubky: CURRENT_USER_PUBKY,
        userDetails: { name: 'Alice', image: null, indexed_at: 1 },
        pagination: { postIds: ids },
      });
      vi.mocked(useLiveQuery).mockReturnValue(undefined);

      render(<MyCollections />);

      expect(screen.queryAllByTestId('collection-card')).toHaveLength(0);
      // Pinned bookmark card is still rendered — it lives outside the filtered list.
      expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    });
  });

  describe('avatar URL resolution', () => {
    it('uses FileController.getAvatarUrl when no local override and userDetails.image is truthy', () => {
      setup({
        currentUserPubky: CURRENT_USER_PUBKY,
        userDetails: { name: 'Alice', image: 'https://remote/avatar.png', indexed_at: 999 },
        localAvatarUrl: null,
      });

      render(<MyCollections />);

      expect(mockGetAvatarUrl).toHaveBeenCalledWith(CURRENT_USER_PUBKY, 999);
      expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute(
        'data-avatar-url',
        `avatar:${CURRENT_USER_PUBKY}:999`,
      );
    });

    it('prefers the local-files store override over the controller URL', () => {
      setup({
        currentUserPubky: CURRENT_USER_PUBKY,
        userDetails: { name: 'Alice', image: 'https://remote/avatar.png', indexed_at: 999 },
        localAvatarUrl: 'blob:local-avatar',
      });

      render(<MyCollections />);

      expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-avatar-url', 'blob:local-avatar');
      expect(mockGetAvatarUrl).not.toHaveBeenCalled();
    });
  });

  describe('MyCollections - Snapshots', () => {
    it('matches the snapshot for the signed-out fallback state', () => {
      setup({ currentUserPubky: null });

      const { container } = render(<MyCollections />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the authenticated state with two loaded cards', () => {
      const ids = [`${AUTHOR_A}:p1`, `${AUTHOR_A}:p2`];
      setup({
        currentUserPubky: CURRENT_USER_PUBKY,
        userDetails: { name: 'Alice', image: null, indexed_at: 0 },
        pagination: {
          postIds: ids,
          loading: false,
          hasMore: true,
        },
      });
      // Resolved live query, no tombstones → echoes `postIds`.
      vi.mocked(useLiveQuery).mockReturnValue(ids);

      const { container } = render(<MyCollections />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
