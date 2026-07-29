import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostAncestors } from '@/hooks/usePostAncestors/usePostAncestors';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
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
vi.mock('@/molecules/PostDeleted/PostDeleted', () => {
  return {
    PostDeleted: () => <div data-testid="post-deleted">Post deleted</div>,
  };
});

// Mock organisms used by SinglePostContent
vi.mock('@/organisms/PostArticleDetail/PostArticleDetail', () => ({
  PostArticleDetail: ({
    postId,
    content,
    isBlurred,
  }: {
    postId: string;
    content: string;
    attachments: unknown[];
    isBlurred: boolean;
  }) => (
    <div data-testid="post-article-detail" data-post-id={postId} data-content={content} data-is-blurred={isBlurred}>
      PostArticleDetail
    </div>
  ),
}));

vi.mock('@/organisms/PostMain/PostMain', async () => {
  const { usePostMainLayout } = await import('@/organisms/PostMain/PostMainLayoutContext');

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
      return (
        <div
          data-testid="post-main"
          data-post-id={postId}
          data-pin-actions-to-bottom={String(pinActionsToBottom)}
          data-is-navigable={String(isNavigable)}
          data-show-full-content-in-list-layout={String(showFullContentInListLayout)}
          data-tags-layout={inheritedTagsLayout}
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

    it('renders PostDeleted component instead of post content when post is deleted', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={DELETED_SHORT_POST_DETAILS} />);

      expect(screen.getByTestId('post-deleted')).toBeInTheDocument();
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

  describe('authentication', () => {
    it('renders replies section for logged-out readers', () => {
      render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);

      expect(screen.getByTestId('thread-tree')).toBeInTheDocument();
      expect(screen.queryByTestId('single-post-participants')).not.toBeInTheDocument();
    });
  });

  describe('SinglePostContent - Snapshots', () => {
    const mockPostId = 'author:post123';

    beforeEach(() => {
      vi.clearAllMocks();
      useHomeStore.setState({ layout: LAYOUT.COLUMNS });
      vi.mocked(usePostCounts).mockReturnValue(mockUsePostCounts());
      vi.mocked(usePostAncestors).mockReturnValue(mockUsePostAncestors());
      vi.mocked(useUserDetailsFromIds).mockReturnValue(mockUseUserDetailsFromIds());
    });

    it('matches snapshot with short post and no replies', () => {
      const { container } = render(<SinglePostContent postId={mockPostId} postDetails={SHORT_POST_DETAILS} />);
      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with long post (article)', () => {
      const { container } = render(<SinglePostContent postId={mockPostId} postDetails={ARTICLE_POST_DETAILS} />);
      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with deleted parent post', () => {
      const { container } = render(<SinglePostContent postId={mockPostId} postDetails={DELETED_SHORT_POST_DETAILS} />);
      expect(container).toMatchSnapshot();
    });
  });
});
