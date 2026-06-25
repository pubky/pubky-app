import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_ROUTES } from '@/app/routes';
import { useBookmarksCollectionSummary } from '@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary';
import enMessages from '../../../../../messages/en.json';
import { CollectionBookmarkCard } from './CollectionBookmarkCard';

const BOOKMARKS_COPY = enMessages.collections.bookmarks;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace !== 'collections') {
      return `${namespace ?? ''}.${key}`;
    }

    const nestedKeys: Record<string, string> = {
      'bookmarks.title': BOOKMARKS_COPY.title,
      'bookmarks.description': BOOKMARKS_COPY.description,
    };

    return nestedKeys[key] ?? `collections.${key}`;
  },
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary', () => ({
  useBookmarksCollectionSummary: vi.fn(),
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

const mockUseBookmarksCollectionSummary = vi.mocked(useBookmarksCollectionSummary);

type SetupOptions = {
  avatarName?: string;
  avatarSeed?: string;
  avatarUrl?: string;
  bookmarkCount?: number;
};

function setup(options: SetupOptions = {}) {
  const {
    avatarName = 'Alice',
    avatarSeed = CURRENT_USER_PUBKY,
    avatarUrl = 'https://example.com/avatar.png',
  } = options;

  mockUseBookmarksCollectionSummary.mockReturnValue({
    avatarName,
    avatarSeed,
    avatarUrl,
    bookmarkCount: 'bookmarkCount' in options ? options.bookmarkCount : 42,
    isProfileResolved: true,
  });
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

    const link = screen.getByRole('link', { name: BOOKMARKS_COPY.title });
    expect(link).toHaveAttribute('href', COLLECTION_ROUTES.BOOKMARKS);
    expect(link).toHaveAttribute('data-cy', 'collection-bookmark-card');
    expect(link).toHaveAttribute('aria-label', BOOKMARKS_COPY.title);
  });

  it('renders the title from i18n', () => {
    setup();
    render(<CollectionBookmarkCard />);
    expect(screen.getByText(BOOKMARKS_COPY.title)).toBeInTheDocument();
  });

  it('renders the description from i18n', () => {
    setup();
    render(<CollectionBookmarkCard />);
    expect(screen.getByText(BOOKMARKS_COPY.description)).toBeInTheDocument();
  });

  it('renders the bookmark count label from the summary', () => {
    setup({ bookmarkCount: 42 });
    render(<CollectionBookmarkCard />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders no count label when the bookmark count is undefined', () => {
    setup({ bookmarkCount: undefined });
    const { container } = render(<CollectionBookmarkCard />);
    // No digits-only label rendered next to the StickyNote icon.
    expect(container.querySelector('.uppercase')).toBeNull();
  });

  it('passes summary avatar metadata to AvatarWithFallback', () => {
    setup({ avatarName: 'Alice', avatarSeed: CURRENT_USER_PUBKY, avatarUrl: 'blob:local-avatar' });
    render(<CollectionBookmarkCard />);

    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-avatar-url', 'blob:local-avatar');
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'Alice');
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-fallback-seed', CURRENT_USER_PUBKY);
  });

  it('applies a custom className to the outer link', () => {
    setup();
    render(<CollectionBookmarkCard className="custom-extra-class" />);

    const link = screen.getByRole('link', { name: BOOKMARKS_COPY.title });
    expect(link.className).toContain('custom-extra-class');
  });
});

describe('CollectionBookmarkCard - Snapshots', () => {
  it('matches the snapshot for a signed-in user with full state', () => {
    setup({
      avatarName: 'Alice',
      avatarSeed: CURRENT_USER_PUBKY,
      avatarUrl: 'https://example.com/avatar.png',
      bookmarkCount: 123,
    });

    const { container } = render(<CollectionBookmarkCard />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the signed-out / no-data fallback state', () => {
    setup({ avatarName: 'U', avatarSeed: 'U', avatarUrl: undefined, bookmarkCount: undefined });

    const { container } = render(<CollectionBookmarkCard />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
