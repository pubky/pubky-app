import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { TagKind } from '@/application/tag/tag.types';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionHero } from './CollectionHero';

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

vi.mock('@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs', () => ({
  usePostReplyRepostDialogs: vi.fn(),
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
const COVER_URL = 'https://example.com/cover.png';

const COLLECTION_CONTENT = JSON.stringify({
  name: 'Based Bitcoin',
  description: 'A bit of Bitcoin purity amidst all of the madness.',
  items: ['pubky://author/pub/pubky.app/posts/a', 'pubky://author/pub/pubky.app/posts/b'],
  cover_image: COVER_URL,
});

const COLLECTION_CONTENT_NO_COVER = JSON.stringify({
  name: 'Quiet collection',
  description: null,
  items: [],
});

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseUserProfile = vi.mocked(useUserProfile);
const mockUseBookmark = vi.mocked(useBookmark);
const mockUsePostReplyRepostDialogs = vi.mocked(usePostReplyRepostDialogs);

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

function setRepostDialogs() {
  const openRepostDialog = vi.fn();
  const openReplyDialog = vi.fn();
  mockUsePostReplyRepostDialogs.mockReturnValue({
    openRepostDialog,
    openReplyDialog,
    dialogs: <div data-testid="repost-dialogs" />,
  });
  return { openRepostDialog, openReplyDialog };
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
  setOwnerProfile('Bitcoin Wizard', 'https://example.com/avatar.png');
  setBookmark();
  setRepostDialogs();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionHero', () => {
  it('renders title, description, item count, and owner avatar from the parsed envelope', () => {
    render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('A bit of Bitcoin purity amidst all of the madness.')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // compact-formatted item count
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Bitcoin Wizard');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/avatar.png');
    expect(avatar).toHaveAttribute('data-fallback-seed', AUTHOR_PUBKY);
  });

  it('wires ClickableTagsList to the composite id with POST kind and the add button enabled', () => {
    render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const tags = screen.getByTestId('clickable-tags-list');
    expect(tags).toHaveAttribute('data-tagged-id', COMPOSITE_ID);
    expect(tags).toHaveAttribute('data-tagged-kind', String(TagKind.POST));
    expect(tags).toHaveAttribute('data-show-add-button', 'true');
  });

  it('omits the description block when the envelope description is empty / nullish', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);

    render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.queryByText('A bit of Bitcoin purity amidst all of the madness.')).not.toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument(); // empty items count still renders
  });

  it('renders the hero skeleton while post details have not loaded yet', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: true });

    render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByTestId('collection-hero-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Based Bitcoin')).not.toBeInTheDocument();
  });

  it('shows a skeleton (not the raw pubky) for the owner name while the profile is null', () => {
    setOwnerProfile(null);

    render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    // The owner name is gated on the resolved profile: while it's null the hero
    // renders a Skeleton rather than flashing the raw pubky as a visible name.
    // The only element carrying the pubky text is the (always-present) avatar
    // mock — there is no separate name <span> falling back to the raw pubky.
    const matches = screen.getAllByText(AUTHOR_PUBKY);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveAttribute('data-testid', 'avatar-with-fallback');
  });

  describe('CTA — owner', () => {
    it('renders Share / Edit / Delete and no Follow / Unfollow', () => {
      setAuthStore(AUTHOR_PUBKY);

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.single.share')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.single.edit')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.single.delete')).toBeInTheDocument();
      expect(screen.queryByLabelText('collections.single.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.single.unfollow')).not.toBeInTheDocument();
    });

    it('does not toggle the bookmark when the owner clicks Edit or Delete (placeholders only)', () => {
      setAuthStore(AUTHOR_PUBKY);
      const toggle = setBookmark({ isBookmarked: false });

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.single.edit'));
      fireEvent.click(screen.getByLabelText('collections.single.delete'));

      expect(toggle).not.toHaveBeenCalled();
    });

    it('opens the repost dialog when the owner clicks Share', () => {
      setAuthStore(AUTHOR_PUBKY);
      const { openRepostDialog } = setRepostDialogs();

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.single.share'));

      expect(openRepostDialog).toHaveBeenCalledTimes(1);
      expect(mockUsePostReplyRepostDialogs).toHaveBeenCalledWith(COMPOSITE_ID);
      expect(screen.getByTestId('repost-dialogs')).toBeInTheDocument();
    });
  });

  describe('CTA — non-owner', () => {
    it('renders a Follow button when the post is not bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.single.follow')).toBeInTheDocument();
      expect(screen.queryByLabelText('collections.single.unfollow')).not.toBeInTheDocument();
    });

    it('renders an Unfollow button when the post is already bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: true });

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.single.unfollow')).toBeInTheDocument();
    });

    it('invokes the bookmark toggle once when clicked', () => {
      setAuthStore('some-other-user');
      const toggle = setBookmark({ isBookmarked: false });

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.single.follow'));

      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('does not call toggle while a previous toggle is still in flight', () => {
      setAuthStore('some-other-user');
      const toggle = setBookmark({ isBookmarked: false, isToggling: true });

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const button = screen.getByLabelText('collections.single.follow') as HTMLButtonElement;
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(toggle).not.toHaveBeenCalled();
    });

    it('opens the repost dialog when a non-owner clicks Share', () => {
      setAuthStore('some-other-user');
      const { openRepostDialog } = setRepostDialogs();

      render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.single.share'));

      expect(openRepostDialog).toHaveBeenCalledTimes(1);
    });
  });

  it('passes the collection-flavored toast copy to useBookmark', () => {
    setAuthStore('some-other-user');

    render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(mockUseBookmark).toHaveBeenCalledWith(
      COMPOSITE_ID,
      expect.objectContaining({
        toastMessages: expect.objectContaining({ added: 'collections.card.toast.followed' }),
      }),
    );
  });

  describe('cover image', () => {
    it('renders a background-image element when an absolute cover URL is present', () => {
      const { container } = render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(container.querySelector(`[style*="${COVER_URL}"]`)).not.toBeNull();
    });

    it('does not render a cover background when the envelope has no cover_image', () => {
      setPostDetails(COLLECTION_CONTENT_NO_COVER);

      const { container } = render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(container.querySelector(`[style*="${COVER_URL}"]`)).toBeNull();
    });
  });
});

describe('CollectionHero - Snapshots', () => {
  it('matches the snapshot for the owner state', () => {
    setAuthStore(AUTHOR_PUBKY);

    const { container } = render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the non-owner Follow state', () => {
    setAuthStore('viewer-pubky');
    setBookmark({ isBookmarked: false });

    const { container } = render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot when no cover image and no description are set', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);
    setAuthStore('viewer-pubky');

    const { container } = render(<CollectionHero authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
