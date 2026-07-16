import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { TagKind } from '@/application/tag/tag.types';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionHero } from './CollectionHero';
import type { CollectionHeroProps } from './CollectionHero.types';

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

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useBookmark/useBookmark', () => ({
  useBookmark: vi.fn(),
}));

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

vi.mock('@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs', () => ({
  usePostReplyRepostDialogs: vi.fn(),
}));

const mockRequireAuth = vi.fn(<T,>(action: () => T) => action());
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: mockRequireAuth }),
}));

const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

const mockDeleteState = vi.hoisted(() => ({
  deletePost: vi.fn().mockResolvedValue(undefined),
  isDeleting: false,
}));
const mockDeletePost = mockDeleteState.deletePost;
vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: () => ({ deletePost: mockDeleteState.deletePost, isDeleting: mockDeleteState.isDeleting }),
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

vi.mock('@/organisms/Collections/DialogEditCollection/DialogEditCollection', () => ({
  DialogEditCollection: ({
    open,
    compositeCollectionId,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    compositeCollectionId: string;
  }) =>
    open ? (
      <div data-testid="edit-collection-dialog" data-collection-id={compositeCollectionId}>
        edit collection dialog
      </div>
    ) : null,
}));

vi.mock('@/organisms/Collections/DialogAddContent/DialogAddContent', () => ({
  DialogAddContent: ({
    dataCy,
    disabled,
  }: {
    dataCy?: string;
    disabled?: boolean;
    target?: { type: string; collectionId?: string };
  }) => (
    <button
      type="button"
      data-testid={dataCy ?? 'add-content-dialog'}
      aria-label="collections.single.content"
      disabled={disabled}
    >
      collections.single.content
    </button>
  ),
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
    maxVisibleTags,
  }: {
    taggedId: string;
    taggedKind: TagKind;
    showAddButton: boolean;
    maxVisibleTags?: number;
  }) => (
    <div
      data-testid="clickable-tags-list"
      data-tagged-id={taggedId}
      data-tagged-kind={String(taggedKind)}
      data-show-add-button={String(showAddButton)}
      data-max-visible-tags={maxVisibleTags}
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

const mockUseUserProfile = vi.mocked(useUserProfile);
const mockUseBookmark = vi.mocked(useBookmark);
const mockUsePostCounts = vi.mocked(usePostCounts);
const mockUsePostReplyRepostDialogs = vi.mocked(usePostReplyRepostDialogs);

let currentPostDetails: EnrichedPostDetails | null | undefined;

function buildPostDetails(content: string, isBlurred = false): EnrichedPostDetails {
  return asOpaque<EnrichedPostDetails>({
    id: COMPOSITE_ID,
    content,
    kind: 'collection',
    indexed_at: 0,
    uri: '',
    attachments: null,
    is_moderated: isBlurred,
    is_blurred: isBlurred,
  });
}

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
  );
}

function setPostDetails(content: string | null, { isBlurred = false }: { isBlurred?: boolean } = {}) {
  currentPostDetails = content ? buildPostDetails(content, isBlurred) : null;
}

function renderHero(overrides: Partial<CollectionHeroProps> = {}) {
  return render(
    <CollectionHero
      authorPubky={AUTHOR_PUBKY}
      postId={POST_ID}
      postDetails={overrides.postDetails ?? currentPostDetails}
      {...overrides}
    />,
  );
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
  mockDeleteState.isDeleting = false;
  for (const key of Object.keys(mockLocalCollections)) delete mockLocalCollections[key];
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
  setOwnerProfile('Bitcoin Wizard', 'https://example.com/avatar.png');
  setBookmark();
  setPostCounts();
  setRepostDialogs();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionHero', () => {
  it('renders title, description, item count, and owner avatar from the parsed envelope', () => {
    renderHero();

    expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('A bit of Bitcoin purity amidst all of the madness.')).toBeInTheDocument();
    expect(screen.getByLabelText('2 posts')).toBeInTheDocument(); // compact-formatted item count
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Bitcoin Wizard');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/avatar.png');
    expect(avatar).toHaveAttribute('data-fallback-seed', AUTHOR_PUBKY);
  });

  it('links the owner avatar and name to the author profile', () => {
    renderHero();

    const profileHref = `/profile/${AUTHOR_PUBKY}`;
    const profileLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === profileHref);
    expect(profileLinks).toHaveLength(2);
    expect(profileLinks[0]).toContainElement(screen.getByTestId('avatar-with-fallback'));
    expect(profileLinks[1]).toHaveTextContent('Bitcoin Wizard');
  });

  it('wires ClickableTagsList to the composite id with POST kind and the add button enabled', () => {
    renderHero();

    const tags = screen.getByTestId('clickable-tags-list');
    expect(tags).toHaveAttribute('data-tagged-id', COMPOSITE_ID);
    expect(tags).toHaveAttribute('data-tagged-kind', String(TagKind.POST));
    expect(tags).toHaveAttribute('data-show-add-button', 'true');
    expect(tags).not.toHaveAttribute('data-max-visible-tags');
    expect(screen.getByLabelText('post.actions.tagPost')).toBeInTheDocument();
  });

  it('toggles the editable tags panel from the tag CTA', () => {
    const { container } = renderHero();

    fireEvent.click(screen.getByLabelText('post.actions.tagPost'));

    expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    const panel = screen.getByTestId('post-tags-panel');
    expect(panel).toHaveAttribute('data-post-id', COMPOSITE_ID);
    expect(panel).toHaveAttribute('data-width-mode', 'fit');
    expect(panel).toHaveAttribute('data-auto-focus-input', 'true');
    expect(panel).toHaveAttribute('data-enable-loading-skeleton', 'false');
    expect(container.querySelector('[data-cy="post-tags-expandable-row"]')).toHaveClass('items-end');
    expect(screen.getByLabelText('post.actions.tagPost')).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('[data-cy="post-tags-expandable-row-actions"]')).not.toBeInTheDocument();
  });

  it('omits the description block when the envelope description is empty / nullish', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);

    renderHero();

    expect(screen.queryByText('A bit of Bitcoin purity amidst all of the madness.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('0 posts')).toBeInTheDocument(); // empty items count still renders
  });

  it('renders the hero skeleton while post details have not loaded yet', () => {
    renderHero({ postDetails: undefined });

    expect(screen.getByTestId('collection-hero-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Based Bitcoin')).not.toBeInTheDocument();
  });

  it('shows a skeleton (not the raw pubky) for the owner name while the profile is null', () => {
    setOwnerProfile(null);

    renderHero();

    // The owner name is gated on the resolved profile: while it's null the hero
    // renders a Skeleton rather than flashing the raw pubky as a visible name.
    // The only element carrying the pubky text is the (always-present) avatar
    // mock — there is no separate name <span> falling back to the raw pubky.
    const matches = screen.getAllByText(AUTHOR_PUBKY);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveAttribute('data-testid', 'avatar-with-fallback');
  });

  describe('moderation — blurred state', () => {
    it('renders the blurred placeholder instead of the hero when the collection is moderated', () => {
      setPostDetails(COLLECTION_CONTENT, { isBlurred: true });

      renderHero();

      expect(screen.getByText('moderation.collectionContentModerated')).toBeInTheDocument();
      expect(screen.queryByText('Based Bitcoin')).not.toBeInTheDocument();
      // Action buttons belong to the real hero, not the placeholder.
      expect(screen.queryByLabelText('collections.single.follow')).not.toBeInTheDocument();
    });

    it('unblurs (via the composite id) when the placeholder is clicked', () => {
      setPostDetails(COLLECTION_CONTENT, { isBlurred: true });

      renderHero();

      fireEvent.click(screen.getByText('moderation.collectionContentModerated'));

      expect(mockUnBlur).toHaveBeenCalledTimes(1);
      expect(mockUnBlur).toHaveBeenCalledWith(COMPOSITE_ID);
    });
  });

  describe('CTA — owner', () => {
    it('renders Content / Share / Edit / Delete and no Follow / Unfollow', () => {
      setAuthStore(AUTHOR_PUBKY);

      renderHero();

      expect(screen.getByLabelText('collections.single.content')).toBeInTheDocument();
      expect(screen.getByTestId('collection-add-content')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.single.share')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.single.edit')).toBeInTheDocument();
      expect(screen.getByLabelText('collections.single.delete')).toBeInTheDocument();
      expect(screen.getByLabelText('post.actions.tagPost')).toBeInTheDocument();
      expect(
        screen
          .getByLabelText('collections.single.delete')
          .compareDocumentPosition(screen.getByLabelText('post.actions.tagPost')) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getByText('collections.single.share', { selector: 'span' })).toHaveClass('hidden', 'lg:inline');
      expect(screen.getByText('collections.single.edit', { selector: 'span' })).toHaveClass('hidden', 'lg:inline');
      expect(screen.getByText('collections.single.delete', { selector: 'span' })).toHaveClass('hidden', 'lg:inline');
      expect(screen.queryByLabelText('collections.single.follow')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('collections.single.unfollow')).not.toBeInTheDocument();
    });

    it('does not toggle the bookmark when the owner clicks Edit or Delete', () => {
      setAuthStore(AUTHOR_PUBKY);
      const toggle = setBookmark({ isBookmarked: false });

      renderHero();

      fireEvent.click(screen.getByLabelText('collections.single.edit'));
      fireEvent.click(screen.getByLabelText('collections.single.delete'));

      expect(toggle).not.toHaveBeenCalled();
    });

    it('disables the Content action while collection delete is in flight', () => {
      setAuthStore(AUTHOR_PUBKY);
      mockDeleteState.isDeleting = true;

      renderHero();

      expect(screen.getByLabelText('collections.single.content')).toBeDisabled();
      expect(screen.getByLabelText('collections.single.share')).toBeDisabled();
      expect(screen.getByLabelText('collections.single.edit')).toBeDisabled();
      expect(screen.getByLabelText('collections.single.delete')).toBeDisabled();
    });

    it('opens the DialogEditCollection (controlled, with the composite id) when the owner clicks Edit', () => {
      setAuthStore(AUTHOR_PUBKY);

      renderHero();

      // Dialog is mounted but `open=false` until the user clicks Edit.
      expect(screen.queryByTestId('edit-collection-dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('collections.single.edit'));

      const dialog = screen.getByTestId('edit-collection-dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('data-collection-id', COMPOSITE_ID);
    });

    it("does not mount the DialogEditCollection for non-owners (the Edit button isn't shown either)", () => {
      setAuthStore('some-other-user');

      renderHero();

      expect(screen.queryByLabelText('collections.single.edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-collection-dialog')).not.toBeInTheDocument();
    });

    it('opens the repost dialog when the owner clicks Share', () => {
      setAuthStore(AUTHOR_PUBKY);
      const { openRepostDialog } = setRepostDialogs();

      renderHero();

      fireEvent.click(screen.getByLabelText('collections.single.share'));

      expect(openRepostDialog).toHaveBeenCalledTimes(1);
      expect(mockUsePostReplyRepostDialogs).toHaveBeenCalledWith(COMPOSITE_ID, {
        title: 'collections.single.shareTitle',
        submitLabel: 'collections.single.share',
        submitIcon: expect.anything(),
        successToastTitle: 'collections.card.toast.shared',
      });
      expect(screen.getByTestId('repost-dialogs')).toBeInTheDocument();
    });

    describe('delete flow', () => {
      it('opens the confirmation dialog with the collection-specific i18n namespace on Delete click', () => {
        setAuthStore(AUTHOR_PUBKY);
        renderHero();

        // Dialog mounts in closed state.
        expect(screen.queryByTestId('dialog-confirm-delete')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('collections.single.delete'));

        const dialog = screen.getByTestId('dialog-confirm-delete');
        expect(dialog).toBeInTheDocument();
        // Must use the collection copy, not `dialogs.deletePost`.
        expect(dialog).toHaveAttribute('data-i18n-namespace', 'dialogs.deleteCollection');
      });

      it('awaits deletePost then redirects to /collections via router.replace', async () => {
        setAuthStore(AUTHOR_PUBKY);
        mockDeletePost.mockClear();
        mockRouterReplace.mockClear();
        renderHero();

        fireEvent.click(screen.getByLabelText('collections.single.delete'));
        fireEvent.click(screen.getByTestId('dialog-confirm-delete-btn'));

        // Await the microtask so the post-redirect chain settles.
        await Promise.resolve();
        await Promise.resolve();

        expect(mockDeletePost).toHaveBeenCalledTimes(1);
        expect(mockDeletePost).toHaveBeenCalledWith(COMPOSITE_ID);
        // Redirect must use `replace` (not `push`) so the back button skips
        // the now-deleted collection page.
        expect(mockRouterReplace).toHaveBeenCalledWith('/collections');
      });

      it('does not mount the confirm dialog for non-owners (Delete button absent)', () => {
        setAuthStore('some-other-user');
        renderHero();

        expect(screen.queryByLabelText('collections.single.delete')).not.toBeInTheDocument();
        expect(screen.queryByTestId('dialog-confirm-delete')).not.toBeInTheDocument();
      });
    });
  });

  describe('CTA — non-owner', () => {
    it('renders a Follow button when the post is not bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: false });

      renderHero();

      expect(screen.getByLabelText('collections.single.follow')).toBeInTheDocument();
      expect(screen.getByLabelText('post.actions.tagPost')).toBeInTheDocument();
      expect(screen.queryByLabelText('collections.single.unfollow')).not.toBeInTheDocument();
    });

    it('renders an Unfollow button when the post is already bookmarked', () => {
      setAuthStore('some-other-user');
      setBookmark({ isBookmarked: true });

      renderHero();

      expect(screen.getByLabelText('collections.single.unfollow')).toBeInTheDocument();
    });

    it('invokes the bookmark toggle once when clicked', () => {
      setAuthStore('some-other-user');
      const toggle = setBookmark({ isBookmarked: false });

      renderHero();

      fireEvent.click(screen.getByLabelText('collections.single.follow'));

      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('does not call toggle while a previous toggle is still in flight', () => {
      setAuthStore('some-other-user');
      const toggle = setBookmark({ isBookmarked: false, isToggling: true });

      renderHero();

      const button = screen.getByLabelText('collections.single.follow') as HTMLButtonElement;
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(toggle).not.toHaveBeenCalled();
    });

    it('opens the repost dialog when a non-owner clicks Share', () => {
      setAuthStore('some-other-user');
      const { openRepostDialog } = setRepostDialogs();

      renderHero();

      expect(screen.getByText('collections.single.share', { selector: 'span' })).toHaveClass('hidden', 'lg:inline');
      fireEvent.click(screen.getByLabelText('collections.single.share'));

      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
      expect(openRepostDialog).toHaveBeenCalledTimes(1);
    });

    it('prompts sign-in instead of toggling bookmark when a guest clicks Follow', () => {
      setAuthStore(null);
      const toggle = setBookmark({ isBookmarked: false });
      mockRequireAuth.mockImplementation(<T,>(_action: () => T) => undefined as T);

      renderHero();

      fireEvent.click(screen.getByLabelText('collections.single.follow'));

      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
      expect(toggle).not.toHaveBeenCalled();
    });

    it('prompts sign-in instead of opening the share dialog when a guest clicks Share', () => {
      setAuthStore(null);
      const { openRepostDialog } = setRepostDialogs();
      mockRequireAuth.mockImplementation(<T,>(_action: () => T) => undefined as T);

      renderHero();

      fireEvent.click(screen.getByLabelText('collections.single.share'));

      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
      expect(openRepostDialog).not.toHaveBeenCalled();
    });
  });

  it('passes the collection-flavored toast copy to useBookmark', () => {
    setAuthStore('some-other-user');

    renderHero();

    expect(mockUseBookmark).toHaveBeenCalledWith(
      COMPOSITE_ID,
      expect.objectContaining({
        toastMessages: expect.objectContaining({ added: 'collections.card.toast.followed' }),
      }),
    );
  });

  describe('cover image', () => {
    it('renders a background-image element when an absolute cover URL is present', () => {
      const { container } = renderHero();

      expect(container.querySelector(`[style*="${COVER_URL}"]`)).not.toBeNull();
    });

    it('does not render a cover background when the envelope has no cover_image', () => {
      setPostDetails(COLLECTION_CONTENT_NO_COVER);

      const { container } = renderHero();

      expect(container.querySelector(`[style*="${COVER_URL}"]`)).toBeNull();
    });

    it('prefers a recently-uploaded blob URL from the local-files store over the envelope cover', () => {
      mockLocalCollections[COMPOSITE_ID] = 'blob:mock-fresh-cover';

      const { container } = renderHero();

      expect(container.querySelector('[style*="blob:mock-fresh-cover"]')).not.toBeNull();
      expect(container.querySelector(`[style*="${COVER_URL}"]`)).toBeNull();
    });

    it('renders the local blob cover even when the envelope has no cover_image', () => {
      setPostDetails(COLLECTION_CONTENT_NO_COVER);
      mockLocalCollections[COMPOSITE_ID] = 'blob:mock-fresh-cover';

      const { container } = renderHero();

      expect(container.querySelector('[style*="blob:mock-fresh-cover"]')).not.toBeNull();
    });
  });
});

describe('CollectionHero - Snapshots', () => {
  it('matches the snapshot for the owner state', () => {
    setAuthStore(AUTHOR_PUBKY);

    const { container } = renderHero();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the non-owner Follow state', () => {
    setAuthStore('viewer-pubky');
    setBookmark({ isBookmarked: false });

    const { container } = renderHero();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot when no cover image and no description are set', () => {
    setPostDetails(COLLECTION_CONTENT_NO_COVER);
    setAuthStore('viewer-pubky');

    const { container } = renderHero();
    expect(container.firstChild).toMatchSnapshot();
  });
});
