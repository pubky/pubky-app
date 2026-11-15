import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { usePostAncestors } from '@/hooks/usePostAncestors/usePostAncestors';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { useUnlockedContent } from '@/hooks/useUnlockedContent/useUnlockedContent';
import type { UseUnlockedContentResult } from '@/hooks/useUnlockedContent/useUnlockedContent.types';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { SinglePostContent } from './SinglePostContent';

// Mock hooks
const SHORT_POST_DETAILS = {
  id: 'author:post123',
  indexed_at: Date.now(),
  kind: 'short' as const,
  uri: 'pubky://author/pub/pubky.app/posts/post123',
  content: 'Test post content',
  attachments: [],
  is_moderated: false,
  is_blurred: false,
} satisfies EnrichedPostDetails;

const ARTICLE_POST_DETAILS = {
  id: 'author:post123',
  indexed_at: Date.now(),
  kind: 'long' as const,
  uri: 'pubky://author/pub/pubky.app/posts/post123',
  content: JSON.stringify({ title: 'Article Title', body: '# Article Title\n\nArticle content' }),
  attachments: [],
  is_moderated: false,
  is_blurred: false,
} satisfies EnrichedPostDetails;

const MALFORMED_LONG_POST_DETAILS = {
  ...ARTICLE_POST_DETAILS,
  content: 'Raw long post content',
} satisfies EnrichedPostDetails;

const DELETED_SHORT_POST_DETAILS = {
  ...SHORT_POST_DETAILS,
  content: '[DELETED]',
} satisfies EnrichedPostDetails;

const LOCK_URL = 'pubky://author/pub/app.locks/lock1.json';
const LOCK_POST_DETAILS = {
  ...SHORT_POST_DETAILS,
  content: JSON.stringify({ lock_title: 'Secret', teaser_description: 'A teaser', content_kind: 'article' }),
  lock: LOCK_URL,
} satisfies EnrichedPostDetails;

const LOCKED: UseUnlockedContentResult = {
  unlockedPost: null,
  applyUnlockedContent: vi.fn(),
  media: [],
  pendingAttachments: [],
  hasCompleteContent: false,
  isOwnLock: false,
  isResolvingOwn: false,
  isResolvingReplica: false,
};
const UNLOCKED_ARTICLE = JSON.stringify({ title: 'Locked essay', body: 'The locked body' });

vi.mock('@/hooks/useLockFile/useLockFile', () => ({
  useLockFile: vi.fn(() => ({ lockFile: null, price: null, isLoading: false })),
}));

vi.mock('@/hooks/useUnlockedContent/useUnlockedContent', () => ({
  useUnlockedContent: vi.fn(),
}));

vi.mock('@/organisms/LockedPostContent/FocusedLockRecovery', () => ({
  FocusedLockRecovery: ({ focusedLock }: { focusedLock: { lock: string } }) => (
    <div data-testid="focused-lock-recovery" data-lock={focusedLock.lock} />
  ),
}));

const mockUsePostCounts = vi.fn(() => ({
  postCounts: {
    id: 'author:post123',
    replies: 0,
    tags: 0,
    unique_tags: 0,
    reposts: 0,
  } satisfies PostCountsModelSchema,
  isLoading: false,
}));

const mockUsePostAncestors = vi.fn(() => ({
  ancestors: [],
  isLoading: false,
  hasError: false,
}));

const mockUseUserDetailsFromIds = vi.fn(() => ({
  users: [],
  isLoading: false,
}));

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

vi.mock('@/hooks/usePostAncestors/usePostAncestors', () => ({
  usePostAncestors: vi.fn(),
}));

vi.mock('@/hooks/useUserDetailsFromIds/useUserDetailsFromIds', () => ({
  useUserDetailsFromIds: vi.fn(),
}));

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card" data-class-name={className}>
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

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
      'data-cy': dataCy,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
      'data-cy'?: string;
    }) => (
      <div
        data-testid="container"
        data-cy={dataCy}
        data-class-name={className}
        data-override-defaults={overrideDefaults}
      >
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/PageHeader/PageHeader', () => {
  return {
    PageHeader: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div data-testid="page-header" {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <p data-testid="typography" className={className}>
        {children}
      </p>
    ),
  };
});

vi.mock('@/atoms/PostThreadConnector/PostThreadConnector.constants', () => {
  return {
    POST_THREAD_CONNECTOR_VARIANTS: {
      REGULAR: 'regular',
      LAST: 'last',
    },
  };
});

vi.mock('@/atoms/PostThreadSpacer/PostThreadSpacer', () => {
  return {
    PostThreadSpacer: () => <div data-testid="post-thread-spacer" />,
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  };
});

// Mock molecules
vi.mock('@/molecules/PostUnavailable/PostUnavailable', () => {
  return {
    PostUnavailable: ({ message }: { message: string }) => (
      <div data-testid="post-unavailable" data-message={message}>
        Post unavailable
      </div>
    ),
  };
});

// Mock organisms used by SinglePostContent
vi.mock('@/organisms/PostArticleDetail/PostArticleDetail', () => ({
  PostArticleDetail: ({
    postId,
    content,
    attachments,
    isBlurred,
    unlocked,
  }: {
    postId: string;
    content: string;
    attachments: unknown[] | null;
    isBlurred: boolean;
    unlocked?: { media: unknown[]; pendingAttachments: unknown[]; isOwnLock: boolean };
  }) => (
    <div
      data-testid="post-article-detail"
      data-post-id={postId}
      data-content={content}
      data-attachments={JSON.stringify(attachments)}
      data-is-blurred={isBlurred}
      data-unlocked={JSON.stringify(unlocked)}
    >
      PostArticleDetail
    </div>
  ),
}));

vi.mock('@/organisms/PostMain/PostMain', async () => {
  const { usePostMainLayout } = await import('@/organisms/PostMain/PostMainLayoutContext');
  const { useFocusedLock } = await import('@/organisms/LockedPostContent/FocusedLockContext');

  return {
    PostMain: ({
      postId,
      pinActionsToBottom,
      isNavigable,
      showFullContentInListLayout,
    }: {
      postId: string;
      pinActionsToBottom?: boolean;
      isNavigable?: boolean;
      showFullContentInListLayout?: boolean;
    }) => {
      const inheritedTagsLayout = usePostMainLayout();
      const focusedLock = useFocusedLock(postId);
      return (
        <div
          data-testid="post-main"
          data-post-id={postId}
          data-pin-actions-to-bottom={String(pinActionsToBottom)}
          data-is-navigable={String(isNavigable)}
          data-show-full-content-in-list-layout={String(showFullContentInListLayout)}
          data-tags-layout={inheritedTagsLayout}
          data-focused-lock-post={focusedLock?.unlocked.unlockedPost?.content ?? 'none'}
        >
          PostMain
        </div>
      );
    },
  };
});

vi.mock('../PostPageHeader/PostPageHeader', () => ({
  PostPageHeader: ({ postId }: { postId: string }) => (
    <div data-testid="post-page-header" data-post-id={postId}>
      PostPageHeader
    </div>
  ),
}));

vi.mock('../SinglePostParticipants/SinglePostParticipants', () => ({
  SinglePostParticipants: ({ postId }: { postId: string }) => (
    <div data-testid="single-post-participants" data-post-id={postId}>
      SinglePostParticipants
    </div>
  ),
}));

vi.mock('../QuickReply/QuickReply', () => ({
  QuickReply: ({ parentPostId, connectorVariant }: { parentPostId: string; connectorVariant?: string }) => (
    <div data-testid="quick-reply" data-parent-post-id={parentPostId} data-connector-variant={connectorVariant}>
      QuickReply
    </div>
  ),
}));

vi.mock('../ThreadTree/ThreadTree', () => ({
  ThreadTree: ({ postId, showQuickReply }: { postId: string; showQuickReply?: boolean }) => (
    <div data-testid="thread-tree" data-post-id={postId} data-show-quick-reply={String(showQuickReply)}>
      ThreadTree
    </div>
  ),
}));

describe('SinglePostContent', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    useHomeStore.setState({ layout: LAYOUT.COLUMNS });
    vi.mocked(usePostCounts).mockReturnValue(mockUsePostCounts());
    vi.mocked(usePostAncestors).mockReturnValue(mockUsePostAncestors());
    vi.mocked(useUserDetailsFromIds).mockReturnValue(mockUseUserDetailsFromIds());
    vi.mocked(useUnlockedContent).mockReturnValue(LOCKED);
  });

  describe('rendering', () => {
    it('renders PostMain for short posts', () => {
      const { container } = render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(container.querySelector('[data-cy="single-post-card"]')).toBeInTheDocument();
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-post-id', mockPostId);
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-pin-actions-to-bottom', 'true');
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-is-navigable', 'false');
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-show-full-content-in-list-layout', 'true');
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-tags-layout', 'inline');
      expect(screen.queryByTestId('post-article-detail')).not.toBeInTheDocument();
    });

    it('derives side tags layout for the single-post surface when the app is in wide mode', () => {
      useHomeStore.setState({ layout: LAYOUT.WIDE });

      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(screen.getByTestId('post-main')).toHaveAttribute('data-tags-layout', 'side');
    });

    it('uses the List layout selected in the Home store', () => {
      useHomeStore.setState({ layout: LAYOUT.LIST });

      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(screen.getByTestId('post-main')).toHaveAttribute('data-tags-layout', 'list');
    });

    it('renders PostArticleDetail for long posts', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={ARTICLE_POST_DETAILS} />);

      expect(screen.getByTestId('post-article-detail')).toBeInTheDocument();
      expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
    });

    it('hides PostPageHeader for article posts', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={ARTICLE_POST_DETAILS} />);

      expect(screen.queryByTestId('post-page-header')).toBeNull();
    });

    it('renders malformed long posts through PostMain', () => {
      const { container } = render(<SinglePostContent postId={mockPostId} postDetails={MALFORMED_LONG_POST_DETAILS} />);

      expect(container.querySelector('[data-cy="single-post-card"]')).toBeInTheDocument();
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-post-id', mockPostId);
      expect(screen.queryByTestId('post-article-detail')).not.toBeInTheDocument();
      expect(screen.queryByText('Replies')).not.toBeInTheDocument();
    });

    it('renders Replies heading for authenticated article posts', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={ARTICLE_POST_DETAILS} />);

      expect(screen.getByText('Replies')).toBeInTheDocument();
    });

    it('renders Replies heading for logged-out article posts', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={ARTICLE_POST_DETAILS} />);

      expect(screen.getByText('Replies')).toBeInTheDocument();
    });

    it('does not render Replies heading for short posts', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(screen.queryByText('Replies')).not.toBeInTheDocument();
    });

    it('renders ThreadTree with showQuickReply=true when parent post is not deleted', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      const tree = screen.getByTestId('thread-tree');
      expect(tree).toHaveAttribute('data-show-quick-reply', 'true');
    });

    it('renders ThreadTree with showQuickReply=false when parent post is deleted', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={DELETED_SHORT_POST_DETAILS} />);

      const tree = screen.getByTestId('thread-tree');
      expect(tree).toHaveAttribute('data-show-quick-reply', 'false');
    });

    it('renders PostUnavailable instead of post content when post is deleted', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={DELETED_SHORT_POST_DETAILS} />);

      expect(screen.getByTestId('post-unavailable')).toHaveAttribute(
        'data-message',
        'This post has been deleted by its author.',
      );
      expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-article-detail')).not.toBeInTheDocument();
    });

    it('does not render SinglePostParticipants inside content', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(screen.queryByTestId('single-post-participants')).not.toBeInTheDocument();
    });

    it('renders ThreadTree with correct postId', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      const tree = screen.getByTestId('thread-tree');
      expect(tree).toBeInTheDocument();
      expect(tree).toHaveAttribute('data-post-id', mockPostId);
    });
  });

  describe('lock post', () => {
    it('reads the lock of the post it shows, and none for a deleted post', () => {
      const { unmount } = render(<SinglePostContent postId={mockPostId} postDetails={LOCK_POST_DETAILS} />);
      expect(useLockFile).toHaveBeenLastCalledWith(LOCK_URL);
      expect(useUnlockedContent).toHaveBeenLastCalledWith(
        expect.objectContaining({ lock: LOCK_URL, postId: mockPostId }),
      );
      unmount();

      render(<SinglePostContent postId={mockPostId} postDetails={{ ...LOCK_POST_DETAILS, content: '[DELETED]' }} />);
      expect(useLockFile).toHaveBeenLastCalledWith(null);
    });

    it('reads nothing for a blurred lock post, which the card shows blurred and every card reads alone', () => {
      vi.mocked(useUnlockedContent).mockReturnValue({
        ...LOCKED,
        unlockedPost: { content: UNLOCKED_ARTICLE, kind: 'long', attachments: null },
      });

      render(<SinglePostContent postId={mockPostId} postDetails={{ ...LOCK_POST_DETAILS, is_blurred: true }} />);

      expect(useLockFile).toHaveBeenLastCalledWith(null);
      expect(useUnlockedContent).toHaveBeenLastCalledWith(expect.objectContaining({ lock: null }));
      expect(screen.getByTestId('post-main')).toHaveAttribute('data-focused-lock-post', 'none');
    });

    it('keeps a locked post in the post card, which reads the page state', () => {
      vi.mocked(useUnlockedContent).mockReturnValue({ ...LOCKED, unlockedPost: null });

      render(<SinglePostContent postId={mockPostId} postDetails={LOCK_POST_DETAILS} />);

      expect(screen.getByTestId('post-main')).toHaveAttribute('data-focused-lock-post', 'none');
      expect(screen.getByTestId('post-page-header')).toBeInTheDocument();
      expect(screen.queryByTestId('post-article-detail')).not.toBeInTheDocument();
      // The card runs its own recovery; a second one would race it
      expect(screen.queryByTestId('focused-lock-recovery')).not.toBeInTheDocument();
    });

    it("lays out an unlocked article as an article page, from the viewer's copy", () => {
      const media = [{ type: 'image/png', name: 'attachment-0', urls: { main: 'blob:cover' }, slot: 0 }];
      vi.mocked(useUnlockedContent).mockReturnValue({
        ...LOCKED,
        unlockedPost: { content: UNLOCKED_ARTICLE, kind: 'long', attachments: null },
        media,
        isOwnLock: true,
      });

      render(<SinglePostContent postId={mockPostId} postDetails={LOCK_POST_DETAILS} />);

      const detail = screen.getByTestId('post-article-detail');
      expect(detail).toHaveAttribute('data-content', UNLOCKED_ARTICLE);
      // The post's own attachments are its teaser's, never the article's
      expect(detail).toHaveAttribute('data-attachments', 'null');
      expect(detail).toHaveAttribute(
        'data-unlocked',
        JSON.stringify({ media, pendingAttachments: [], isOwnLock: true }),
      );
      expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-page-header')).not.toBeInTheDocument();
      expect(screen.getByText('Replies')).toBeInTheDocument();
      // The card that recovers a purchase with unreadable bytes is gone, so the page runs it instead
      expect(screen.getByTestId('focused-lock-recovery')).toHaveAttribute('data-lock', LOCK_URL);
    });

    it('keeps an unlocked post that is not an article in the post card', () => {
      vi.mocked(useUnlockedContent).mockReturnValue({
        ...LOCKED,
        unlockedPost: { content: 'unlocked note', kind: 'short', attachments: null },
      });

      render(<SinglePostContent postId={mockPostId} postDetails={LOCK_POST_DETAILS} />);

      expect(screen.getByTestId('post-main')).toHaveAttribute('data-focused-lock-post', 'unlocked note');
      expect(screen.queryByTestId('post-article-detail')).not.toBeInTheDocument();
    });
  });

  describe('authentication', () => {
    it('renders replies section for logged-out readers', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(screen.getByTestId('thread-tree')).toBeInTheDocument();
      expect(screen.queryByTestId('single-post-participants')).not.toBeInTheDocument();
    });
  });
});
