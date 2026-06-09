import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { TagKind } from '@/application/tag/tag.types';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionCard } from './CollectionCard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuthStore = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useBookmark/useBookmark', () => ({
  useBookmark: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
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

vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: ({
    taggedId,
    taggedKind,
    showAddButton,
  }: {
    taggedId: string;
    taggedKind: TagKind;
    showAddButton: boolean;
  }) => (
    <div
      data-testid="clickable-tags-list"
      data-tagged-id={taggedId}
      data-tagged-kind={String(taggedKind)}
      data-show-add-button={String(showAddButton)}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
const COMPOSITE_ID = `${AUTHOR_PUBKY}:${POST_ID}`;

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
const mockUseBookmark = vi.mocked(useBookmark);

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
  );
}

function setPostDetails(content: string | null) {
  mockUsePostDetails.mockReturnValue({
    postDetails: content
      ? asOpaque<EnrichedPostDetails>({
          id: COMPOSITE_ID,
          content,
          kind: 'collection',
          indexed_at: 0,
          uri: '',
          attachments: null,
          is_moderated: false,
          is_blurred: false,
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

function setBookmark({ isBookmarked = false, isToggling = false } = {}) {
  const toggle = vi.fn().mockResolvedValue(undefined);
  mockUseBookmark.mockReturnValue({
    isBookmarked,
    isLoading: false,
    isToggling,
    toggle,
  });
  return toggle;
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
  setOwnerProfile('Bitcoin Wizard', 'https://example.com/avatar.png');
  setBookmark();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionCard', () => {
  it('renders title, description, item count, and owner avatar from the parsed envelope', () => {
    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('A bit of Bitcoin purity amidst all of the madness.')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // items length
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Bitcoin Wizard');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/avatar.png');
    expect(avatar).toHaveAttribute('data-fallback-seed', AUTHOR_PUBKY);
  });

  it('renders the link with the canonical /collections/<author>/<id> href', () => {
    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const link = screen.getByRole('link', { name: 'Based Bitcoin' });
    expect(link).toHaveAttribute('href', `/collections/${AUTHOR_PUBKY}/${POST_ID}`);
    expect(link).toHaveAttribute('data-cy', 'collection-card');
  });

  it('wires ClickableTagsList to the composite id with POST kind and the add button enabled', () => {
    render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const tags = screen.getByTestId('clickable-tags-list');
    expect(tags).toHaveAttribute('data-tagged-id', COMPOSITE_ID);
    expect(tags).toHaveAttribute('data-tagged-kind', String(TagKind.POST));
    expect(tags).toHaveAttribute('data-show-add-button', 'true');
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
    expect(screen.getByText('0')).toBeInTheDocument(); // empty items count still renders
  });

  it('renders the card skeleton while post details have not loaded yet', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: true });

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    // Pre-load: the card defers to `CollectionCardSkeleton`, so the real link
    // and item count are not yet in the DOM.
    expect(container.querySelector('a[data-cy="collection-card"]')).toBeNull();
    expect(screen.queryByText('Based Bitcoin')).not.toBeInTheDocument();
  });

  describe('CTA — non-owner', () => {
    it('renders a Follow button when the post is not bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.card.follow')).toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.delete')).not.toBeInTheDocument();
    });

    it('renders an Unfollow button when the post is already bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: true });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.card.unfollow')).toBeInTheDocument();
    });

    it('invokes the bookmark toggle and stops the click from triggering navigation', () => {
      setAuthStore('some-other-user');
      const toggle = setBookmark({ isBookmarked: false });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const button = screen.getByLabelText('collections.card.follow');
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      const preventDefault = vi.spyOn(clickEvent, 'preventDefault');
      const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
      button.dispatchEvent(clickEvent);

      expect(toggle).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalled();
      expect(stopPropagation).toHaveBeenCalled();
    });

    it('does not call toggle while a previous toggle is still in flight', () => {
      setAuthStore('some-other-user');
      const toggle = setBookmark({ isBookmarked: false, isToggling: true });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const button = screen.getByLabelText('collections.card.follow') as HTMLButtonElement;
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(toggle).not.toHaveBeenCalled();
    });
  });

  describe('CTA — owner', () => {
    it('renders the Delete placeholder button when the viewer owns the collection', () => {
      setAuthStore(AUTHOR_PUBKY);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.card.delete')).toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.unfollow')).not.toBeInTheDocument();
    });

    it('does not toggle the bookmark when the owner clicks Delete (placeholder only)', () => {
      setAuthStore(AUTHOR_PUBKY);
      const toggle = setBookmark({ isBookmarked: false });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.card.delete'));

      expect(toggle).not.toHaveBeenCalled();
    });
  });

  describe('variant="preview"', () => {
    it('renders title, description, item count, and owner avatar', () => {
      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} variant="preview" />);

      expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
      expect(screen.getByText('A bit of Bitcoin purity amidst all of the madness.')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'Bitcoin Wizard');
    });

    it('hides the inline tags row, Follow/Unfollow, and Delete actions for non-owners', () => {
      setAuthStore('some-other-user');

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} variant="preview" />);

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.unfollow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.delete')).not.toBeInTheDocument();
    });

    it('hides the inline tags row and Delete action for the owner', () => {
      setAuthStore(AUTHOR_PUBKY);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} variant="preview" />);

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.delete')).not.toBeInTheDocument();
    });
  });

  describe('preview contrast', () => {
    it('keeps the action row hidden regardless of contrast value', () => {
      setAuthStore('some-other-user');

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} variant="preview" contrast="strong" />);

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.delete')).not.toBeInTheDocument();
    });
  });
});

describe('CollectionCard - Snapshots', () => {
  it('matches the snapshot for the non-owner Follow state', () => {
    setAuthStore('viewer-pubky');
    setBookmark({ isBookmarked: false });

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the owner Delete state', () => {
    setAuthStore(AUTHOR_PUBKY);

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot when no cover image and no description are set', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);
    setAuthStore('viewer-pubky');

    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
