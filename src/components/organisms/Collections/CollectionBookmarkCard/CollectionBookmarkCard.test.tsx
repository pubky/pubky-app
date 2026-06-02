import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_ROUTES } from '@/app/routes';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UseLocalFirstQueryResult } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery.types';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionBookmarkCard } from './CollectionBookmarkCard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockLocalAvatarUrl: string | null | undefined = null;

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useLocalFirstQuery/useLocalFirstQuery', () => ({
  useLocalFirstQuery: vi.fn(),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: (selector: (state: { profile: string | null | undefined }) => unknown) =>
    selector({ profile: mockLocalAvatarUrl }),
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((pubky: string, indexedAt: number) => `mocked-avatar-url:${pubky}:${indexedAt}`),
  },
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getCounts: vi.fn(),
    fetchCounts: vi.fn(),
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

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const CURRENT_USER_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);
const mockUseLocalFirstQuery = vi.mocked(useLocalFirstQuery);
const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);

type UserDetailsFixture = {
  name?: string;
  image?: string | null;
  indexed_at?: number;
} | null;

type UserCountsFixture = { bookmarks?: number } | undefined;

function setup({
  userDetails = null,
  currentUserPubky = null,
  userCounts = undefined,
  localAvatarUrl = null,
}: {
  userDetails?: UserDetailsFixture;
  currentUserPubky?: string | null;
  userCounts?: UserCountsFixture;
  localAvatarUrl?: string | null;
} = {}) {
  mockLocalAvatarUrl = localAvatarUrl;
  mockUseCurrentUserProfile.mockReturnValue({
    userDetails: userDetails ? asOpaque<NexusUserDetails>(userDetails) : null,
    currentUserPubky,
  });
  mockUseLocalFirstQuery.mockReturnValue(
    asOpaque<UseLocalFirstQueryResult<NexusUserCounts>>({
      data: userCounts ? asOpaque<NexusUserCounts>(userCounts) : undefined,
      isLoading: false,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionBookmarkCard', () => {
  it('renders the link with the canonical bookmarks href, data-cy, and aria-label', () => {
    setup();
    render(<CollectionBookmarkCard />);

    const link = screen.getByRole('link', { name: 'collections.bookmarks.title' });
    expect(link).toHaveAttribute('href', COLLECTION_ROUTES.BOOKMARKS);
    expect(link).toHaveAttribute('data-cy', 'collection-bookmark-card');
    expect(link).toHaveAttribute('aria-label', 'collections.bookmarks.title');
  });

  it('renders the title from i18n', () => {
    setup();
    render(<CollectionBookmarkCard />);
    expect(screen.getByText('collections.bookmarks.title')).toBeInTheDocument();
  });

  it('renders the description from i18n', () => {
    setup();
    render(<CollectionBookmarkCard />);
    expect(screen.getByText('collections.bookmarks.description')).toBeInTheDocument();
  });

  it('renders the formatted count label when userCounts.bookmarks is defined', () => {
    setup({ currentUserPubky: CURRENT_USER_PUBKY, userCounts: { bookmarks: 42 } });
    render(<CollectionBookmarkCard />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders no count label when userCounts is undefined', () => {
    setup({ currentUserPubky: CURRENT_USER_PUBKY, userCounts: undefined });
    const { container } = render(<CollectionBookmarkCard />);
    // No digits-only label rendered next to the StickyNote icon.
    expect(container.querySelector('.uppercase')).toBeNull();
  });

  it('uses the localFiles store override as the avatar URL when present', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: 'https://remote/avatar.png', indexed_at: 123 },
      localAvatarUrl: 'blob:local-avatar',
    });
    render(<CollectionBookmarkCard />);

    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-avatar-url', 'blob:local-avatar');
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('falls back to FileController.getAvatarUrl when no local override and userDetails.image is truthy', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: 'https://remote/avatar.png', indexed_at: 999 },
      localAvatarUrl: null,
    });
    render(<CollectionBookmarkCard />);

    expect(mockGetAvatarUrl).toHaveBeenCalledWith(CURRENT_USER_PUBKY, 999);
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute(
      'data-avatar-url',
      `mocked-avatar-url:${CURRENT_USER_PUBKY}:999`,
    );
  });

  it('avatar URL is empty (undefined) when no local override and userDetails.image is falsy', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: null, indexed_at: 0 },
      localAvatarUrl: null,
    });
    render(<CollectionBookmarkCard />);

    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-avatar-url', '');
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it("falls back to 'U' as the avatar name when userDetails.name is missing", () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: '', image: null, indexed_at: 0 },
    });
    render(<CollectionBookmarkCard />);

    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'U');
  });

  it("falls back to 'U' as the avatar name when userDetails is null", () => {
    setup({ currentUserPubky: null, userDetails: null });
    render(<CollectionBookmarkCard />);

    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'U');
  });

  it('passes enabled=false to useLocalFirstQuery when currentUserPubky is null', () => {
    setup({ currentUserPubky: null });
    render(<CollectionBookmarkCard />);

    const args = mockUseLocalFirstQuery.mock.calls.at(-1)?.[0];
    expect(args?.enabled).toBe(false);
    expect(args?.deps).toEqual([null]);
  });

  it('passes enabled=true to useLocalFirstQuery when currentUserPubky is set', () => {
    setup({ currentUserPubky: CURRENT_USER_PUBKY });
    render(<CollectionBookmarkCard />);

    const args = mockUseLocalFirstQuery.mock.calls.at(-1)?.[0];
    expect(args?.enabled).toBe(true);
    expect(args?.deps).toEqual([CURRENT_USER_PUBKY]);
    expect(typeof args?.queryFn).toBe('function');
    expect(typeof args?.fetchFn).toBe('function');
  });

  it('applies a custom className to the outer link', () => {
    setup();
    render(<CollectionBookmarkCard className="custom-extra-class" />);

    const link = screen.getByRole('link', { name: 'collections.bookmarks.title' });
    expect(link.className).toContain('custom-extra-class');
  });
});

describe('CollectionBookmarkCard - Snapshots', () => {
  it('matches the snapshot for a signed-in user with full state', () => {
    setup({
      currentUserPubky: CURRENT_USER_PUBKY,
      userDetails: { name: 'Alice', image: 'https://remote/avatar.png', indexed_at: 7 },
      userCounts: { bookmarks: 123 },
      localAvatarUrl: null,
    });

    const { container } = render(<CollectionBookmarkCard />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the signed-out / no-data fallback state', () => {
    setup({ currentUserPubky: null, userDetails: null, userCounts: undefined });

    const { container } = render(<CollectionBookmarkCard />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
