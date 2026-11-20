import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { ResourceSurfaceProvider, useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { PostContentBase } from '@/organisms/PostContentBase/PostContentBase';
import { PostPreviewCard } from './PostPreviewCard';

// Mock hooks
const mockNavigateToPost = vi.fn();
const mockNavigateToCollection = vi.fn();
const mockTtlRef = vi.fn();
vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({
    navigateToPost: mockNavigateToPost,
    navigateToCollection: mockNavigateToCollection,
  }),
}));

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: vi.fn(() => ({
    ref: mockTtlRef,
    isVisible: false,
  })),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: vi.fn(() => ({ embedUrl: null })),
}));

vi.mock('@/molecules/PostUnavailable/PostUnavailable', () => ({
  PostUnavailable: ({ message }: { message: string }) => <div data-testid="post-unavailable" data-message={message} />,
}));

// Mock organisms
vi.mock('@/organisms/PostContentBase/PostContentBase', async () => {
  const { useIsPostPreviewNavigable } = await import('@/molecules/PostPreviewCard/PostPreviewNestingContext');
  return {
    PostContentBase: vi.fn(({ postId, embedUrl }: { postId: string; embedUrl?: string | null }) => {
      // Mentions and hashtags read this context several layers below PostContentBase.
      const navigable = useIsPostPreviewNavigable();
      return (
        <div
          data-testid="post-content-base"
          data-post-id={postId}
          data-navigable={String(navigable)}
          data-embed-url={embedUrl ?? ''}
        >
          PostContentBase {postId}
        </div>
      );
    }),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: vi.fn(
      ({ postId, timeAgoPlacement, navigable }: { postId: string; timeAgoPlacement?: string; navigable?: boolean }) => (
        <div
          data-testid="post-header"
          data-post-id={postId}
          data-time-ago-placement={timeAgoPlacement}
          data-navigable={String(navigable ?? true)}
        >
          PostHeader {postId}
        </div>
      ),
    ),
  };
});

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => {
  return {
    CollectionCard: vi.fn(
      ({
        authorPubky,
        postId,
        presentation,
        interactiveActions,
        navigable,
        className,
      }: {
        authorPubky: string;
        postId: string;
        presentation?: string;
        interactiveActions?: boolean;
        navigable?: boolean;
        className?: string;
      }) => (
        <div
          data-testid="collection-card"
          data-author-pubky={authorPubky}
          data-post-id={postId}
          data-presentation={presentation}
          data-interactive-actions={String(interactiveActions ?? true)}
          data-navigable={String(navigable ?? true)}
          className={className}
        />
      ),
    ),
  };
});

const mockOpenReplyDialog = vi.fn();
const mockOpenRepostDialog = vi.fn();
vi.mock('@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs', () => ({
  usePostReplyRepostDialogs: vi.fn((postId: string) => ({
    openReplyDialog: mockOpenReplyDialog,
    openRepostDialog: mockOpenRepostDialog,
    dialogs: (
      <div data-testid="post-dialogs" data-post-id={postId}>
        <p data-testid="dialog-body">Reply</p>
      </div>
    ),
  })),
}));

vi.mock('@/organisms/PostInlineTagsActions/PostInlineTagsActions', () => ({
  PostInlineTagsActions: ({
    postId,
    surface,
    className,
    actionsClassName,
    onReplyClick,
    onRepostClick,
  }: {
    postId: string;
    surface?: string;
    className?: string;
    actionsClassName?: string;
    onReplyClick: () => void;
    onRepostClick: () => void;
  }) => (
    <div
      data-testid="post-inline-tags-actions"
      data-post-id={postId}
      data-surface={surface}
      data-class-name={className}
      data-actions-class-name={actionsClassName}
      data-resource-surface={useResourceSurface()}
    >
      <button type="button" data-testid="footer-reply" onClick={onReplyClick}>
        Reply
      </button>
      <button type="button" data-testid="footer-repost" onClick={onRepostClick}>
        Repost
      </button>
    </div>
  ),
}));

vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: ({
    taggedId,
    readOnly,
    showAddButton,
  }: {
    taggedId: string;
    readOnly?: boolean;
    showAddButton?: boolean;
  }) => (
    <div
      data-testid="clickable-tags-list"
      data-tagged-id={taggedId}
      data-read-only={String(readOnly)}
      data-show-add-button={String(showAddButton)}
    />
  ),
}));

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({
      children,
      className,
      onClick,
      onKeyDown,
      role,
      tabIndex,
      'aria-label': ariaLabel,
      ref,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      onKeyDown?: (e: React.KeyboardEvent) => void;
      role?: string;
      tabIndex?: number;
      'aria-label'?: string;
      ref?: React.Ref<HTMLDivElement>;
    }) => (
      <div
        data-testid="card"
        className={className}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role={role}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        ref={ref}
      >
        {children}
      </div>
    ),
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" className={className}>
        {children}
      </div>
    ),
  };
});

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseTtlSubscription = vi.mocked(useTtlSubscription);

// Minimal resolved post — PostHeader / PostContentBase are mocked, so only the
// non-null `postDetails` (and `isLoading: false`) matters for the missing check.
const resolvedPost = {
  postDetails: { id: 'test-post-123', kind: 'short' } as never,
  isLoading: false,
};

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const COLLECTION_POST_ID = '0034BBBDFK83G';
const COLLECTION_COMPOSITE_ID = `${AUTHOR_PUBKY}:${COLLECTION_POST_ID}`;

const collectionPost = {
  postDetails: { id: COLLECTION_COMPOSITE_ID, kind: 'collection' } as never,
  isLoading: false,
};

/** Reads the resource surface where it renders (a resource card there would stand on it). */
const ResourceSurfaceProbe = ({ testId }: { testId: string }) => (
  <span data-testid={testId} data-resource-surface={useResourceSurface()} />
);

describe('PostPreviewCard', () => {
  beforeEach(() => {
    mockNavigateToPost.mockClear();
    mockOpenReplyDialog.mockClear();
    mockOpenRepostDialog.mockClear();
    mockNavigateToCollection.mockClear();
    mockTtlRef.mockClear();
    mockUseTtlSubscription.mockClear();
    mockUsePostDetails.mockReturnValue(resolvedPost);
  });

  it('renders with required props', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
  });

  it('passes the previewed post its own web embed', () => {
    vi.mocked(useRepostInfo).mockReturnValueOnce({ embedUrl: 'https://en.wikipedia.org/wiki/Bitcoin' } as never);

    render(<PostPreviewCard postId="test-post-123" />);

    expect(useRepostInfo).toHaveBeenCalledWith('test-post-123');
    expect(screen.getByTestId('post-content-base')).toHaveAttribute(
      'data-embed-url',
      'https://en.wikipedia.org/wiki/Bitcoin',
    );
  });

  it('places the timestamp under user info for narrow preview cards', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('post-header')).toHaveAttribute('data-time-ago-placement', 'bottom-left');
  });

  it('constrains the preview card surface so long author names can truncate', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('card')).toHaveClass('w-full', 'max-w-full', 'min-w-0');
    expect(screen.getByTestId('card-content')).toHaveClass('w-full', 'max-w-full', 'min-w-0');
  });

  it('has correct accessibility attributes', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    expect(card).toHaveAttribute('role', 'link');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('aria-label', 'View original post');
  });

  it('shows link affordances by default', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('card')).toHaveClass('cursor-pointer', 'hover:bg-accent/50');
  });

  it('keeps the author header and the body links navigable by default (feed repost preview)', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('post-header')).toHaveAttribute('data-navigable', 'true');
    expect(screen.getByTestId('post-content-base')).toHaveAttribute('data-navigable', 'true');
  });

  it('navigates to post page on click', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.click(card);

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
    expect(mockNavigateToCollection).not.toHaveBeenCalled();
  });

  it('navigates to post page on Enter key', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
    expect(mockNavigateToCollection).not.toHaveBeenCalled();
  });

  it('navigates to post page on Space key', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
    expect(mockNavigateToCollection).not.toHaveBeenCalled();
  });

  it('does not navigate on other keys', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Tab' });

    expect(mockNavigateToPost).not.toHaveBeenCalled();
  });

  describe('its own footer', () => {
    it('shows the previewed post’s own tags and actions on the muted surface, with its own dialogs', () => {
      render(<PostPreviewCard postId="test-post-123" />);

      const footer = screen.getByTestId('post-inline-tags-actions');
      expect(footer).toHaveAttribute('data-post-id', 'test-post-123');
      expect(footer).toHaveAttribute('data-surface', 'muted');
      expect(screen.getByTestId('card-content')).toContainElement(footer);
      expect(usePostReplyRepostDialogs).toHaveBeenCalledWith('test-post-123');
      expect(screen.getByTestId('post-dialogs')).toHaveAttribute('data-post-id', 'test-post-123');
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('footer-reply'));
      fireEvent.click(screen.getByTestId('footer-repost'));
      expect(mockOpenReplyDialog).toHaveBeenCalledTimes(1);
      expect(mockOpenRepostDialog).toHaveBeenCalledTimes(1);
    });

    it('closes up its buttons in a narrow quote, so ⋯ stays on their row', () => {
      render(<PostPreviewCard postId="test-post-123" />);

      // Container queries on the footer's own width (a quote in a post on a phone), in a resource card's steps.
      const footer = screen.getByTestId('post-inline-tags-actions');
      expect(footer).toHaveAttribute('data-class-name', '@container/post-preview-actions');
      expect(footer.getAttribute('data-actions-class-name')?.split(' ')).toEqual(
        expect.arrayContaining([
          'w-full',
          '@max-sm/post-preview-actions:gap-1.5',
          '@max-sm/post-preview-actions:[&>*]:px-2.5!',
          '@max-[17rem]/post-preview-actions:gap-1',
          '@max-[17rem]/post-preview-actions:[&>*]:gap-1!',
          '@max-[17rem]/post-preview-actions:[&>*]:px-2!',
          '@max-[14.5rem]/post-preview-actions:[&>*]:px-1.5!',
          '@max-[13.75rem]/post-preview-actions:gap-0.5',
        ]),
      );
    });

    it('keeps Enter and Space on a footer control for that control, not the card link', () => {
      render(<PostPreviewCard postId="test-post-123" />);

      fireEvent.keyDown(screen.getByTestId('footer-reply'), { key: 'Enter' });
      fireEvent.keyDown(screen.getByTestId('footer-reply'), { key: ' ' });

      expect(mockNavigateToPost).not.toHaveBeenCalled();
    });

    it('renders its dialogs outside the card, so a click in them opens no post', () => {
      const onOuterPostClick = vi.fn();
      render(
        <div onClick={onOuterPostClick}>
          <PostPreviewCard postId="test-post-123" />
        </div>,
      );

      expect(screen.getByTestId('card')).not.toContainElement(screen.getByTestId('post-dialogs'));
      fireEvent.click(screen.getByTestId('dialog-body'));

      expect(mockNavigateToPost).not.toHaveBeenCalled();
      expect(onOuterPostClick).not.toHaveBeenCalled();
    });

    it('opens its footer and dialogs on the default resource surface, its content stays on the caller’s', () => {
      vi.mocked(PostContentBase).mockImplementationOnce(() => <ResourceSurfaceProbe testId="content-surface" />);
      vi.mocked(usePostReplyRepostDialogs).mockReturnValueOnce({
        openReplyDialog: mockOpenReplyDialog,
        openRepostDialog: mockOpenRepostDialog,
        dialogs: <ResourceSurfaceProbe testId="dialogs-surface" />,
      });

      render(
        <ResourceSurfaceProvider surface="card">
          <PostPreviewCard postId="test-post-123" />
        </ResourceSurfaceProvider>,
      );

      expect(screen.getByTestId('content-surface')).toHaveAttribute('data-resource-surface', 'card');
      expect(screen.getByTestId('post-inline-tags-actions')).toHaveAttribute('data-resource-surface', 'embed');
      expect(screen.getByTestId('dialogs-surface')).toHaveAttribute('data-resource-surface', 'embed');
    });

    it('shows no footer and no dialogs when the post around it already acts on this post', () => {
      render(<PostPreviewCard postId="test-post-123" showTagsActions={false} />);

      expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
      expect(screen.queryByTestId('post-inline-tags-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-dialogs')).not.toBeInTheDocument();
    });

    it('shows read-only tags and no action row with interactiveActions={false}', () => {
      render(<PostPreviewCard postId="test-post-123" interactiveActions={false} />);

      expect(screen.getByTestId('clickable-tags-list')).toHaveAttribute('data-read-only', 'true');
      expect(screen.queryByTestId('post-inline-tags-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-dialogs')).not.toBeInTheDocument();
    });

    it('leaves a collection original’s tags to its CollectionCard', () => {
      mockUsePostDetails.mockReturnValue(collectionPost);

      render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} />);

      expect(screen.getByTestId('collection-card')).toBeInTheDocument();
      expect(screen.queryByTestId('post-inline-tags-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-dialogs')).not.toBeInTheDocument();
    });

    it('shows no footer for a post that is not found', () => {
      mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });

      render(<PostPreviewCard postId="missing-post" />);

      expect(screen.queryByTestId('post-inline-tags-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    });
  });

  describe('navigable={false}', () => {
    it('still renders the post header and content', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('post-header')).toHaveAttribute('data-post-id', 'test-post-123');
      expect(screen.getByTestId('post-content-base')).toHaveAttribute('data-post-id', 'test-post-123');
    });

    it('drops the link role, focus stop and label', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      const card = screen.getByTestId('card');
      expect(card).not.toHaveAttribute('role');
      expect(card).not.toHaveAttribute('tabIndex');
      expect(card).not.toHaveAttribute('aria-label');
    });

    it('drops the pointer cursor and hover background', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      const card = screen.getByTestId('card');
      expect(card).not.toHaveClass('cursor-pointer');
      expect(card).not.toHaveClass('hover:bg-accent/50');
      expect(card).toHaveClass('w-full', 'max-w-full', 'min-w-0');
    });

    it('does not navigate on click', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      fireEvent.click(screen.getByTestId('card'));

      expect(mockNavigateToPost).not.toHaveBeenCalled();
      expect(mockNavigateToCollection).not.toHaveBeenCalled();
    });

    it('does not navigate on Enter or Space', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      const card = screen.getByTestId('card');
      fireEvent.keyDown(card, { key: 'Enter' });
      fireEvent.keyDown(card, { key: ' ' });

      expect(mockNavigateToPost).not.toHaveBeenCalled();
      expect(mockNavigateToCollection).not.toHaveBeenCalled();
    });

    it('renders the author header without profile links', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      expect(screen.getByTestId('post-header')).toHaveAttribute('data-navigable', 'false');
    });

    it('marks the body non-navigating so mentions and hashtags render as text', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      expect(screen.getByTestId('post-content-base')).toHaveAttribute('data-navigable', 'false');
    });

    it('shows the post’s tags read-only, with no action row and no dialogs (Reply and Repost dialogs)', () => {
      render(<PostPreviewCard postId="test-post-123" navigable={false} />);

      const tags = screen.getByTestId('clickable-tags-list');
      expect(tags).toHaveAttribute('data-tagged-id', 'test-post-123');
      expect(tags).toHaveAttribute('data-read-only', 'true');
      expect(tags).toHaveAttribute('data-show-add-button', 'false');
      expect(screen.queryByTestId('post-inline-tags-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-dialogs')).not.toBeInTheDocument();
    });

    it('renders a collection original without its link wrapper', () => {
      mockUsePostDetails.mockReturnValue(collectionPost);

      render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} navigable={false} />);

      expect(screen.getByTestId('collection-card')).toHaveAttribute('data-navigable', 'false');
      expect(screen.getByTestId('collection-card')).toHaveAttribute('data-presentation', 'embed');
    });
  });

  it('renders PostUnavailable (not header/content) when the original post is not found', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });

    render(<PostPreviewCard postId="missing-post" />);

    // PostUnavailable replaces the inner CardContent so the header doesn't skeleton.
    expect(screen.getByTestId('post-unavailable')).toHaveAttribute('data-message', 'Post not found.');
    expect(screen.queryByTestId('card-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content-base')).not.toBeInTheDocument();
  });

  it('renders PostUnavailable (not header/content) when the original post is deleted', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: { id: 'deleted-post', kind: 'short', content: '[DELETED]' } as never,
      isLoading: false,
    });

    render(<PostPreviewCard postId="deleted-post" />);

    // PostUnavailable replaces the inner CardContent so no header is shown —
    // matching how PostMain renders deleted posts.
    expect(screen.getByTestId('post-unavailable')).toHaveAttribute(
      'data-message',
      'This post has been deleted by its author.',
    );
    expect(screen.queryByTestId('card-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content-base')).not.toBeInTheDocument();
  });

  it('renders PostUnavailable (not CollectionCard) when a collection original is deleted', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: { id: COLLECTION_COMPOSITE_ID, kind: 'collection', content: '[DELETED]' } as never,
      isLoading: false,
    });

    render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} />);

    expect(screen.getByTestId('post-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
  });

  it('renders header/content (not PostUnavailable) while the original post is still loading', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: true });

    render(<PostPreviewCard postId="loading-post" />);

    expect(screen.queryByTestId('post-unavailable')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
  });

  it('renders CollectionCard directly for collection originals without the post preview shell', () => {
    mockUsePostDetails.mockReturnValue(collectionPost);

    render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} className="bg-card" />);

    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-presentation', 'embed');
    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-interactive-actions', 'true');
    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-navigable', 'true');
    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-author-pubky', AUTHOR_PUBKY);
    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-post-id', COLLECTION_POST_ID);
    expect(screen.getByTestId('collection-card')).toHaveClass('w-full');
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content-base')).not.toBeInTheDocument();
  });

  it('passes interactiveActions={false} to CollectionCard when set', () => {
    mockUsePostDetails.mockReturnValue(collectionPost);

    render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} interactiveActions={false} />);

    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-interactive-actions', 'false');
  });

  it('squares the top corners of collection embeds when flush', () => {
    mockUsePostDetails.mockReturnValue(collectionPost);

    render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} flush />);

    expect(screen.getByTestId('collection-card')).toHaveClass('rounded-t-none');
  });

  it('keeps rounded corners for collection embeds by default', () => {
    mockUsePostDetails.mockReturnValue(collectionPost);

    render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} />);

    expect(screen.getByTestId('collection-card')).not.toHaveClass('rounded-t-none');
  });

  it('is the TTL subscriber for a collection original (observes the embed wrapper)', () => {
    // This wrapper owns the embed's subscription; the nested `CollectionCard`
    // skips its own for `presentation="embed"` (covered in CollectionCard tests).
    mockUsePostDetails.mockReturnValue(collectionPost);

    const { container } = render(<PostPreviewCard postId={COLLECTION_COMPOSITE_ID} />);

    expect(mockUseTtlSubscription).toHaveBeenCalledWith({ type: 'post', id: COLLECTION_COMPOSITE_ID });
    expect(mockTtlRef).toHaveBeenCalledWith(container.querySelector('[data-cy="post-preview-card"]'));
    expect(screen.getByTestId('collection-card')).toHaveAttribute('data-presentation', 'embed');
  });
});
