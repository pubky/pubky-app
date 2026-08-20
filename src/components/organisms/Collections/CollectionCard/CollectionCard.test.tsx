import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import type { Pubky } from '@/models/models.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { CollectionCard } from './CollectionCard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuthStore = vi.fn();
const mockLocalCollections: Record<string, string | undefined> = {};
const mockSetShowSignInDialog = vi.fn();
const mockHandleTagToggle = vi.fn();
const mockHandleTagAdd = vi.fn().mockResolvedValue({ success: true });
const mockIsViewerTagger = vi.fn((tag: TagWithAvatars) => tag.relationship ?? false);
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useEntityTags/useEntityTags', () => ({
  useEntityTags: vi.fn((_entityId, _taggedKind, options) => ({
    tags: options?.providedTags ?? mockCollectionTags,
    count: options?.providedTags?.length ?? mockCollectionTags.length,
    isLoading: false,
    isViewerTagger: mockIsViewerTagger,
    handleTagToggle: mockHandleTagToggle,
    handleTagAdd: mockHandleTagAdd,
  })),
}));

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: vi.fn((tags: NexusTag[]) => ({
    enrichedTags: tags.map((tag) => ({
      ...tag,
      taggers: tag.taggers.map((taggerId, index) => ({
        id: taggerId as Pubky,
        name: `User ${index + 1}`,
        avatarUrl: `https://example.com/${taggerId}.png`,
      })),
    })),
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: () => false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/usePostTaggers/usePostTaggers', () => ({
  usePostTaggers: () => ({
    taggersByLabel: new Map(),
    taggerStates: new Map(),
    fetchAllTaggers: vi.fn(),
  }),
}));

vi.mock('@/molecules/UserInfoPopover/UserInfoPopover', () => ({
  UserInfoPopover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-info-popover">{children}</div>
  ),
}));

vi.mock('@/molecules/CollectionDeleted/CollectionDeleted', () => ({
  CollectionDeleted: () => <div data-testid="collection-deleted" />,
}));

vi.mock('@/molecules/CollectionMissing/CollectionMissing', () => ({
  CollectionMissing: () => <div data-testid="collection-missing" />,
}));

const mockUnBlur = vi.fn();
vi.mock('@/controllers/moderation/moderation', () => ({
  ModerationController: {
    unBlur: (...args: unknown[]) => mockUnBlur(...args),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: (selector: (state: { collections: Record<string, string | undefined> }) => unknown) =>
    selector({ collections: mockLocalCollections }),
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

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
const COMPOSITE_ID = `${AUTHOR_PUBKY}:${POST_ID}`;
const mockCollectionTags: NexusTag[] = [
  { label: 'bitcoin', taggers_count: 5, taggers: ['user1', 'user2'], relationship: true },
  { label: 'ethereum', taggers_count: 3, taggers: ['user3'], relationship: false },
  { label: 'web3', taggers_count: 10, taggers: [], relationship: false },
  { label: 'nostr', taggers_count: 1, taggers: ['user4'], relationship: false },
];

const COLLECTION_CONTENT = JSON.stringify({
  name: 'Based Bitcoin',
  description: 'A bit of Bitcoin purity amidst all of the madness.',
  items: ['pubky://author/pub/pubky.app/posts/a', 'pubky://author/pub/pubky.app/posts/b'],
  cover_image: 'https://example.com/cover.png',
});

const COLLECTION_CONTENT_NO_COVER = JSON.stringify({
  name: 'Quiet collection',
  description: null,
  items: [],
});

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseUserProfile = vi.mocked(useUserProfile);

function getTagsList(container: HTMLElement = document.body) {
  return container.querySelector('[data-cy="clickable-tags-list"]');
}

function getAddTagButton(container: HTMLElement = document.body) {
  return container.querySelector('[data-cy="post-tag-add-button"]');
}

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation(
    (selector: (state: { currentUserPubky: string | null; setShowSignInDialog: () => void }) => unknown) =>
      selector({ currentUserPubky, setShowSignInDialog: mockSetShowSignInDialog }),
  );
}

function setPostDetails(content: string | null, { isBlurred = false }: { isBlurred?: boolean } = {}) {
  mockUsePostDetails.mockReturnValue({
    postDetails: content
      ? asOpaque<EnrichedPostDetails>({
          id: COMPOSITE_ID,
          content,
          kind: 'collection',
          indexed_at: 0,
          uri: '',
          attachments: null,
          is_moderated: isBlurred,
          is_blurred: isBlurred,
        })
      : null,
    isLoading: false,
  });
}

function setOwnerProfile(name: string | null, avatarUrl?: string) {
  mockUseUserProfile.mockReturnValue({
    profile: name
      ? {
          name,
          bio: '',
          publicKey: AUTHOR_PUBKY,
          emoji: '🌴',
          status: '',
          avatarUrl,
          link: '',
          links: null,
        }
      : null,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useIsMobile).mockReturnValue(false);
  mockIsViewerTagger.mockImplementation((tag: TagWithAvatars) => tag.relationship ?? false);
  for (const key of Object.keys(mockLocalCollections)) delete mockLocalCollections[key];
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
  setOwnerProfile('Bitcoin Wizard', 'https://example.com/avatar.png');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionCard', () => {
  it('renders title, description, item count, and owner avatar from the parsed envelope', () => {
    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('A bit of Bitcoin purity amidst all of the madness.')).toBeInTheDocument();
    expect(screen.getByLabelText('2 posts')).toBeInTheDocument(); // items length
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Bitcoin Wizard');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/avatar.png');
    expect(avatar).toHaveAttribute('data-fallback-seed', AUTHOR_PUBKY);
  });

  it('stacks the metadata below the title and keeps the posts label visible on mobile', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);

    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const header = document.querySelector<HTMLElement>('[data-cy="collection-card-header"]');
    const metadata = document.querySelector<HTMLElement>('[data-cy="collection-card-metadata"]');
    const countLabel = screen.getByText('posts', { exact: false });

    expect(header).toHaveClass('flex-col', 'lg:flex-row');
    expect(header).not.toHaveClass('sm:flex-row');
    expect(header).toContainElement(metadata);
    expect(countLabel).toHaveClass('inline');
    expect(countLabel).not.toHaveClass('hidden');
  });

  it('renders the link with the canonical /collections/<author>/<id> href', () => {
    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const link = screen.getByRole('link', { name: 'Based Bitcoin' });
    expect(link).toHaveAttribute('href', `/collections/${AUTHOR_PUBKY}/${POST_ID}`);
    expect(link).toHaveAttribute('data-cy', 'collection-card');
  });

  it('restores the add-tag control for landing cards while keeping the tag-count button hidden', () => {
    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(getTagsList(container)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'bitcoin tag (5 posts)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ethereum tag (3 posts)' })).toBeInTheDocument();
    expect(getAddTagButton(container)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Tag post/)).not.toBeInTheDocument();
  });

  it('pins the tags row to the bottom of the card without card-level actions', () => {
    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const tagsRow = container.querySelector('[data-cy="collection-card-bottom-row"]');

    expect(tagsRow).toHaveClass('mt-auto', 'w-full');
    expect(container.querySelector('[data-cy="post-tags-expandable-row-actions"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-cy="collection-card-actions"]')).not.toBeInTheDocument();
  });

  it('does not render Follow, Unfollow, or Delete actions on standalone cards', () => {
    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.queryByLabelText('Follow')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unfollow')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
  });

  describe('wide timeline layout', () => {
    it('applies wide padding, typography, avatar size, and full width when tags layout is side on desktop', () => {
      const { container } = render(
        <PostMainLayoutProvider tagsLayout="side">
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </PostMainLayoutProvider>,
      );

      const link = screen.getByRole('link', { name: 'Based Bitcoin' });
      expect(link).toHaveAttribute('data-layout', 'wide');
      expect(link).toHaveClass('w-full');

      expect(screen.getByText('Based Bitcoin')).toHaveClass('text-2xl', 'leading-8');
      expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-size', 'lg');
      expect(container.querySelector('[data-slot="card-content"]')).toHaveClass('p-12');
    });

    it('falls back to the compact card when side layout is active on mobile', () => {
      vi.mocked(useIsMobile).mockReturnValue(true);

      render(
        <PostMainLayoutProvider tagsLayout="side">
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </PostMainLayoutProvider>,
      );

      const link = screen.getByRole('link', { name: 'Based Bitcoin' });
      expect(link).toHaveAttribute('data-layout', 'default');
      expect(screen.getByText('Based Bitcoin')).toHaveClass('text-xl', 'leading-7');
      expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-size', 'sm');
      expect(screen.getByRole('button', { name: 'bitcoin tag (5 posts)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ethereum tag (3 posts)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'web3 tag (10 posts)' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'nostr tag (1 posts)' })).not.toBeInTheDocument();
    });

    it('uses full width when tags layout is inline on desktop', () => {
      render(
        <PostMainLayoutProvider tagsLayout="inline">
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </PostMainLayoutProvider>,
      );

      const link = screen.getByRole('link', { name: 'Based Bitcoin' });
      expect(link).toHaveAttribute('data-layout', 'default');
      expect(link).toHaveClass('w-full');
    });
  });

  it('falls back to the author pubky as the owner name when the profile is missing', () => {
    setOwnerProfile(null);

    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', AUTHOR_PUBKY);
  });

  it('omits the description block when the envelope description is empty / nullish', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);

    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.queryByText('A bit of Bitcoin purity amidst all of the madness.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('0 posts')).toBeInTheDocument(); // empty items count still renders
  });

  describe('cover image — local-files store fallback', () => {
    // Cover-image background lives in an aria-hidden overlay div with `bg-cover`.
    const findCoverOverlay = (container: HTMLElement) =>
      container.querySelector<HTMLDivElement>('[aria-hidden="true"].bg-cover');

    it('uses a recently-uploaded blob URL from the local-files store when present', () => {
      mockLocalCollections[COMPOSITE_ID] = 'blob:mock-fresh-cover';

      const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
      const overlay = findCoverOverlay(container);

      expect(overlay).not.toBeNull();
      expect(overlay!.getAttribute('style')).toContain('blob:mock-fresh-cover');
      expect(overlay!.getAttribute('style')).not.toContain('https://example.com/cover.png');
    });

    it('falls back to the envelope cover URL when the local-files store has no entry', () => {
      const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
      const overlay = findCoverOverlay(container);

      expect(overlay).not.toBeNull();
      expect(overlay!.getAttribute('style')).toContain('https://example.com/cover.png');
    });
  });

  it('renders the card skeleton while post details have not loaded yet', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: true });

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    // Pre-load: the card defers to `CollectionCardSkeleton`, so the real link
    // and item count are not yet in the DOM.
    expect(container.querySelector('a[data-cy="collection-card"]')).toBeNull();
    expect(screen.queryByText('Based Bitcoin')).not.toBeInTheDocument();
    // While loading we keep the skeleton, not the not-found fallback.
    expect(screen.queryByTestId('collection-missing')).not.toBeInTheDocument();
  });

  it('renders the CollectionMissing fallback when the collection is not found (settled null)', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByTestId('collection-missing')).toBeInTheDocument();
    // Not a skeleton and not the real card.
    expect(container.querySelector('a[data-cy="collection-card"]')).toBeNull();
  });

  describe('deleted-state fallback', () => {
    // When `usePostDetails` resolves with `content === '[DELETED]'`, the card
    // must render the `CollectionDeleted` molecule instead of an empty card,
    // without calling `parseCollectionContent` against the `[DELETED]` sentinel.
    it('renders the CollectionDeleted molecule when content is the [DELETED] tombstone', () => {
      setPostDetails('[DELETED]');
      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByTestId('collection-deleted')).toBeInTheDocument();
    });
  });

  describe('moderation — blurred state', () => {
    it('renders the blurred placeholder instead of the card when the collection is moderated', () => {
      setPostDetails(COLLECTION_CONTENT, { isBlurred: true });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      // Overlay copy is shown; the real title / navigable link are not rendered.
      expect(screen.getByText('Collection content moderated.')).toBeInTheDocument();
      expect(screen.queryByText('Based Bitcoin')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Based Bitcoin' })).not.toBeInTheDocument();
    });

    it('unblurs (via the composite id) and stops propagation when the placeholder is clicked', () => {
      setPostDetails(COLLECTION_CONTENT, { isBlurred: true });
      const parentClick = vi.fn();

      render(
        <div onClick={parentClick}>
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </div>,
      );

      fireEvent.click(screen.getByText('Collection content moderated.'));

      expect(mockUnBlur).toHaveBeenCalledTimes(1);
      expect(mockUnBlur).toHaveBeenCalledWith(COMPOSITE_ID);
      expect(parentClick).not.toHaveBeenCalled();
    });

    it('renders the deleted fallback (not the blur placeholder) when a moderated collection is also deleted', () => {
      setPostDetails('[DELETED]', { isBlurred: true });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByTestId('collection-deleted')).toBeInTheDocument();
      expect(screen.queryByText('Collection content moderated.')).not.toBeInTheDocument();
    });
  });

  describe('embed presentation', () => {
    it('renders title, description, item count, and owner avatar', () => {
      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" />);

      expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
      expect(screen.getByText('A bit of Bitcoin purity amidst all of the madness.')).toBeInTheDocument();
      expect(screen.getByLabelText('2 posts')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'Bitcoin Wizard');
    });

    it('shows tags without card-level actions or tag-management controls', () => {
      vi.mocked(useIsMobile).mockReturnValue(true);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" />);

      expect(getTagsList()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'bitcoin tag (5 posts)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ethereum tag (3 posts)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'web3 tag (10 posts)' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'nostr tag (1 posts)' })).not.toBeInTheDocument();
      expect(getAddTagButton()).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Unfollow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Tag post/)).not.toBeInTheDocument();
      expect(document.querySelector('[data-cy="collection-card-actions"]')).not.toBeInTheDocument();
    });

    it('clips the cover at the link boundary in preview embeds', () => {
      const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" />);

      const link = container.querySelector('a[data-cy="collection-card"]');
      const card = container.querySelector('[data-slot="card"]');

      expect(link).toHaveClass('overflow-hidden', 'rounded-md');
      expect(card).toHaveClass('rounded-none');
    });

    it('keeps rounded corners on the card shell outside preview embeds', () => {
      const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const link = container.querySelector('a[data-cy="collection-card"]');
      const card = container.querySelector('[data-slot="card"]');

      expect(link).not.toHaveClass('overflow-hidden');
      expect(card).toHaveClass('rounded-md');
      expect(card).not.toHaveClass('rounded-none');
    });

    it('elevates the count pill on embeds without a cover', () => {
      setPostDetails(
        JSON.stringify({
          name: 'Based Bitcoin',
          description: 'A bit of Bitcoin purity amidst all of the madness.',
          items: ['pubky://author/pub/pubky.app/posts/a', 'pubky://author/pub/pubky.app/posts/b'],
        }),
      );

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" />);

      const countBadge = screen.getByLabelText('2 posts');
      expect(countBadge).toHaveClass('bg-card');
    });

    it('renders read-only tags when interactiveActions is false', () => {
      render(
        <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" interactiveActions={false} />,
      );

      expect(getTagsList()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'bitcoin tag (5 posts)' })).toBeInTheDocument();
      expect(getAddTagButton()).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Tag post/)).not.toBeInTheDocument();
    });
  });
});

describe('CollectionCard - Snapshots', () => {
  it('matches the default card snapshot', () => {
    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot when no cover image and no description are set', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the wide timeline layout', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('CollectionCard - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches the mobile snapshot with up to three visible tags', () => {
    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
