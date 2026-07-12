import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { TagKind } from '@/application/tag/tag.types';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionCard } from './CollectionCard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuthStore = vi.fn();
const mockLocalCollections: Record<string, string | undefined> = {};

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: { count?: number }) =>
    namespace === 'collections' && key === 'postCount'
      ? values?.count === 1
        ? 'post'
        : 'posts'
      : `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useBookmark/useBookmark', () => ({
  useBookmark: vi.fn(),
}));

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

const mockRequireAuth = vi.fn(<T,>(action: () => T) => action());
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: mockRequireAuth }),
}));

const mockDeletePost = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: () => ({ deletePost: mockDeletePost, isDeleting: false }),
}));

vi.mock('@/molecules/DialogConfirmDelete/DialogConfirmDelete', () => ({
  DialogConfirmDelete: ({
    open,
    onConfirm,
    i18nNamespace,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    i18nNamespace?: string;
  }) =>
    open ? (
      <div data-testid="dialog-confirm-delete" data-i18n-namespace={i18nNamespace}>
        <button data-testid="dialog-confirm-delete-btn" onClick={onConfirm}>
          confirm delete
        </button>
      </div>
    ) : null,
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

vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: ({
    taggedId,
    taggedKind,
    showAddButton,
    readOnly,
  }: {
    taggedId: string;
    taggedKind: TagKind;
    showAddButton: boolean;
    readOnly?: boolean;
  }) => (
    <div
      data-testid="clickable-tags-list"
      data-tagged-id={taggedId}
      data-tagged-kind={String(taggedKind)}
      data-show-add-button={String(showAddButton)}
      data-read-only={String(readOnly ?? false)}
    />
  ),
}));

vi.mock('@/organisms/PostTagsPanel/PostTagsPanel', () => ({
  PostTagsPanel: ({
    postId,
    widthMode,
    autoFocusInput,
    enableLoadingSkeleton,
    className,
  }: {
    postId: string;
    widthMode: string;
    autoFocusInput: boolean;
    enableLoadingSkeleton: boolean;
    className?: string;
  }) => (
    <div
      data-testid="post-tags-panel"
      data-auto-focus-input={String(autoFocusInput)}
      data-enable-loading-skeleton={String(enableLoadingSkeleton)}
      data-post-id={postId}
      data-width-mode={widthMode}
      className={className}
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
const mockUsePostCounts = vi.mocked(usePostCounts);

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
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

function setPostCounts(uniqueTags = 3) {
  mockUsePostCounts.mockReturnValue({
    postCounts: {
      id: COMPOSITE_ID,
      tags: 4,
      unique_tags: uniqueTags,
      reposts: 0,
      replies: 0,
    },
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useIsMobile).mockReturnValue(false);
  for (const key of Object.keys(mockLocalCollections)) delete mockLocalCollections[key];
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
  setOwnerProfile('Bitcoin Wizard', 'https://example.com/avatar.png');
  setBookmark();
  setPostCounts();
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

  it('pins the tags and action row to the bottom of the card with mt-auto', () => {
    const { container } = render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const actionRow = container.querySelector('[data-cy="collection-card-bottom-row"]');

    expect(actionRow).toHaveClass('mt-auto', 'flex-row', 'items-end', 'justify-between');
    expect(container.querySelector('[data-cy="post-tags-expandable-row-actions"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-cy="collection-card-tag-actions"]')).toHaveClass('self-end');
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

  describe('CTA — non-owner', () => {
    it('renders a Follow button when the post is not bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByLabelText('collections.card.follow')).toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.delete')).not.toBeInTheDocument();
    });

    it('renders the tag CTA before the Follow button', () => {
      setAuthStore('some-other-user');

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const tagButton = screen.getByLabelText('post.actions.tagPost');
      const followButton = screen.getByLabelText('collections.card.follow');
      expect(tagButton.compareDocumentPosition(followButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    it('prompts sign-in instead of toggling bookmark when a guest clicks Follow', () => {
      setAuthStore(null);
      const toggle = setBookmark({ isBookmarked: false });
      mockRequireAuth.mockImplementation(<T,>(_action: () => T) => undefined as T);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.card.follow'));

      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
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

    it('renders the tag CTA before the Delete button', () => {
      setAuthStore(AUTHOR_PUBKY);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const tagButton = screen.getByLabelText('post.actions.tagPost');
      const deleteButton = screen.getByLabelText('collections.card.delete');
      expect(tagButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('toggles the editable tags panel from the tag CTA and suppresses card navigation', () => {
      setAuthStore(AUTHOR_PUBKY);
      const onParentClick = vi.fn();

      render(
        <div onClick={onParentClick}>
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </div>,
      );

      const tagButton = screen.getByLabelText('post.actions.tagPost');
      fireEvent.click(tagButton);

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      const panel = screen.getByTestId('post-tags-panel');
      expect(panel).toHaveAttribute('data-post-id', COMPOSITE_ID);
      expect(panel).toHaveAttribute('data-width-mode', 'full');
      expect(panel).toHaveAttribute('data-auto-focus-input', 'true');
      expect(panel).toHaveAttribute('data-enable-loading-skeleton', 'false');
      expect(document.querySelector('[data-cy="post-tags-expandable-row"]')).toHaveClass('items-end');
      expect(document.querySelector('[data-cy="post-tags-expandable-row-actions"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-cy="collection-card-tag-actions"]')).toHaveClass('self-end');
      expect(onParentClick).not.toHaveBeenCalled();
    });

    it('lets clicks in expanded tag panel gaps bubble to the card link', () => {
      setAuthStore(AUTHOR_PUBKY);
      const onParentClick = vi.fn();

      render(
        <div onClick={onParentClick}>
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </div>,
      );

      fireEvent.click(screen.getByLabelText('post.actions.tagPost'));

      const tagsColumn = document.querySelector('[data-cy="post-tags-expandable-row"]')?.firstElementChild;
      expect(tagsColumn).toBeTruthy();
      fireEvent.click(tagsColumn!);

      expect(onParentClick).toHaveBeenCalledTimes(1);
    });

    it('suppresses navigation when clicking inside the expanded tag panel', () => {
      setAuthStore(AUTHOR_PUBKY);
      const onParentClick = vi.fn();

      render(
        <div onClick={onParentClick}>
          <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
        </div>,
      );

      fireEvent.click(screen.getByLabelText('post.actions.tagPost'));
      fireEvent.click(screen.getByTestId('post-tags-panel'));

      expect(onParentClick).not.toHaveBeenCalled();
    });

    it('renders Delete as an icon-only button (aria-label, no visible label text)', () => {
      setAuthStore(AUTHOR_PUBKY);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      const deleteButton = screen.getByLabelText('collections.card.delete');
      expect(deleteButton).not.toHaveTextContent('collections.card.delete');
    });

    it('does not toggle the bookmark when the owner clicks Delete (placeholder only)', () => {
      setAuthStore(AUTHOR_PUBKY);
      const toggle = setBookmark({ isBookmarked: false });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      fireEvent.click(screen.getByLabelText('collections.card.delete'));

      expect(toggle).not.toHaveBeenCalled();
    });

    describe('delete flow', () => {
      it('opens the confirmation dialog with collection-specific copy on Delete click', () => {
        setAuthStore(AUTHOR_PUBKY);
        setBookmark({ isBookmarked: false });
        render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

        fireEvent.click(screen.getByLabelText('collections.card.delete'));

        const dialog = screen.getByTestId('dialog-confirm-delete');
        expect(dialog).toBeInTheDocument();
        // The dialog must use the collection-specific i18n namespace, not the
        // generic `dialogs.deletePost` copy.
        expect(dialog).toHaveAttribute('data-i18n-namespace', 'dialogs.deleteCollection');
      });

      it('calls useDeletePost.deletePost with the composite id when confirming', () => {
        setAuthStore(AUTHOR_PUBKY);
        setBookmark({ isBookmarked: false });
        mockDeletePost.mockClear();
        render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

        fireEvent.click(screen.getByLabelText('collections.card.delete'));
        fireEvent.click(screen.getByTestId('dialog-confirm-delete-btn'));

        expect(mockDeletePost).toHaveBeenCalledTimes(1);
        expect(mockDeletePost).toHaveBeenCalledWith(COMPOSITE_ID);
      });
    });
  });

  describe('deleted-state fallback', () => {
    // When `usePostDetails` resolves with `content === '[DELETED]'`, the card
    // must render the `CollectionDeleted` molecule instead of an empty card,
    // without calling `parseCollectionContent` against the `[DELETED]` sentinel.
    it('renders the CollectionDeleted molecule when content is the [DELETED] tombstone', () => {
      setPostDetails('[DELETED]');
      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByTestId('collection-deleted')).toBeInTheDocument();
      // No follow / delete action row is rendered for deleted collections.
      expect(screen.queryByLabelText('collections.card.delete')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.card.unfollow')).not.toBeInTheDocument();
    });
  });

  describe('moderation — blurred state', () => {
    it('renders the blurred placeholder instead of the card when the collection is moderated', () => {
      setPostDetails(COLLECTION_CONTENT, { isBlurred: true });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      // Overlay copy is shown; the real title / navigable link are not rendered.
      expect(screen.getByText('moderation.collectionContentModerated')).toBeInTheDocument();
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

      fireEvent.click(screen.getByText('moderation.collectionContentModerated'));

      expect(mockUnBlur).toHaveBeenCalledTimes(1);
      expect(mockUnBlur).toHaveBeenCalledWith(COMPOSITE_ID);
      expect(parentClick).not.toHaveBeenCalled();
    });

    it('renders the deleted fallback (not the blur placeholder) when a moderated collection is also deleted', () => {
      setPostDetails('[DELETED]', { isBlurred: true });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

      expect(screen.getByTestId('collection-deleted')).toBeInTheDocument();
      expect(screen.queryByText('moderation.collectionContentModerated')).not.toBeInTheDocument();
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

    it('shows tags, Follow, and the tag-toggle CTA for non-owners', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.card.follow')).toBeInTheDocument();
      expect(screen.getByLabelText('post.actions.tagPost')).toBeInTheDocument();
    });

    it('shows tags, Delete, and the tag-toggle CTA for the owner', () => {
      setAuthStore(AUTHOR_PUBKY);

      render(<CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.card.delete')).toBeInTheDocument();
      expect(screen.getByLabelText('post.actions.tagPost')).toBeInTheDocument();
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

    it('elevates action CTAs on embeds without a cover', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });
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

      expect(screen.getByLabelText('collections.card.follow')).toHaveClass('bg-card', 'text-foreground');
      expect(screen.getByLabelText('post.actions.tagPost', { exact: false })).toHaveClass('bg-card', 'text-foreground');
    });

    it('hides CTAs and renders read-only tags when interactiveActions is false', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });

      render(
        <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} presentation="embed" interactiveActions={false} />,
      );

      const tagsList = screen.getByTestId('clickable-tags-list');
      expect(tagsList).toHaveAttribute('data-show-add-button', 'false');
      expect(tagsList).toHaveAttribute('data-read-only', 'true');
      expect(screen.queryByLabelText('collections.card.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('post.actions.tagPost')).not.toBeInTheDocument();
      expect(document.querySelector('[data-cy="collection-card-tag-actions"]')).not.toBeInTheDocument();
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

  it('matches the snapshot for the wide timeline layout', () => {
    setAuthStore('viewer-pubky');
    setBookmark({ isBookmarked: false });

    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <CollectionCard authorPubky={AUTHOR_PUBKY} postId={POST_ID} />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
