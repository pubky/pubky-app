import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_MY_SECTION_SKELETON_COUNT, COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { Pubky } from '@/models/models.types';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { MyCollections } from './MyCollections';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockLocalAvatarUrl: string | null | undefined = null;

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

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
  removePosts: vi.fn(),
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

    expect(screen.getByText('collections.my.title')).toBeInTheDocument();
    const skeleton = screen.getByTestId('avatar-stack-skeleton');
    expect(skeleton).toHaveAttribute('data-count', '1');
    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(mockUseStreamPagination).not.toHaveBeenCalled();
  });

  it('renders authenticated empty state: title + AvatarWithFallback header + pinned card; no skeletons, no Show More', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 7 },
      pagination: { postIds: [], loading: false, hasMore: false },
    });

    render(<MyCollections />);

    expect(screen.getByText('collections.my.title')).toBeInTheDocument();
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Alice');
    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-card-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByText('collections.showMore')).not.toBeInTheDocument();
  });

  it('renders one CollectionCard per stream post id with parsed author/postId; no Show More when hasMore=false', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: {
        postIds: [`${AUTHOR_A}:p1`, `${AUTHOR_A}:p2`],
        loading: false,
        hasMore: false,
      },
    });

    render(<MyCollections />);

    const cards = screen.getAllByTestId('collection-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-author-pubky', AUTHOR_A);
    expect(cards[0]).toHaveAttribute('data-post-id', 'p1');
    expect(cards[1]).toHaveAttribute('data-author-pubky', AUTHOR_A);
    expect(cards[1]).toHaveAttribute('data-post-id', 'p2');
    expect(screen.getByTestId('collection-bookmark-card')).toBeInTheDocument();
    expect(screen.queryByText('collections.showMore')).not.toBeInTheDocument();
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
  });

  it('does NOT render skeletons on warm-cache load (loading=true, postIds non-empty)', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      pagination: {
        postIds: [`${AUTHOR_A}:p1`],
        loading: true,
        hasMore: false,
      },
    });

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

    const button = screen.getByRole('button', { name: 'collections.showMore' });
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
    expect(screen.getByText('collections.showMore')).toBeInTheDocument();
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
      // `onError` is wired up to surface a `collections.loadFailed` toast on
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

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      title: 'toast.error',
      description: 'collections.loadFailed',
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
      setup({
        currentUserPubky: CURRENT_USER_PUBKY,
        userDetails: { name: 'Alice', image: null, indexed_at: 0 },
        pagination: {
          postIds: [`${AUTHOR_A}:p1`, `${AUTHOR_A}:p2`],
          loading: false,
          hasMore: true,
        },
      });

      const { container } = render(<MyCollections />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
