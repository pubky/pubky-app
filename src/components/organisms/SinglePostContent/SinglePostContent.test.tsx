import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostAncestors } from '@/hooks/usePostAncestors/usePostAncestors';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { UseRequireAuthResult } from '@/hooks/useRequireAuth/useRequireAuth.types';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { SinglePostContent } from './SinglePostContent';

// Mock hooks
const mockUseRequireAuth = vi.fn(
  (): UseRequireAuthResult => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
);

const mockUsePostDetails = vi.fn(() => ({
  postDetails: {
    id: 'author:post123',
    indexed_at: Date.now(),
    kind: 'short' as const,
    uri: 'pubky://author/pub/pubky.app/posts/post123',
    content: 'Test post content',
    attachments: [],
    is_moderated: false,
    is_blurred: false,
  } satisfies EnrichedPostDetails,
  isLoading: false,
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

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: vi.fn(),
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
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" data-class-name={className} data-override-defaults={overrideDefaults}>
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
vi.mock('../SinglePostArticle/SinglePostArticle', () => ({
  SinglePostArticle: ({
    postId,
    content,
    isBlurred,
  }: {
    postId: string;
    content: string;
    attachments: unknown[];
    isBlurred: boolean;
  }) => (
    <div data-testid="single-post-article" data-post-id={postId} data-content={content} data-is-blurred={isBlurred}>
      SinglePostArticle
    </div>
  ),
}));

vi.mock('../SinglePostCard/SinglePostCard', async () => {
  const { usePostMainLayout } = await import('@/organisms/PostMain/PostMainLayout');

  return {
    SinglePostCard: ({ postId }: { postId: string }) => {
      const inheritedTagsLayout = usePostMainLayout();
      return (
        <div data-testid="single-post-card" data-post-id={postId} data-tags-layout={inheritedTagsLayout}>
          SinglePostCard
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
    useHomeStore.getState().reset();
    vi.mocked(useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(usePostCounts).mockReturnValue(mockUsePostCounts());
    vi.mocked(usePostAncestors).mockReturnValue(mockUsePostAncestors());
    vi.mocked(useUserDetailsFromIds).mockReturnValue(mockUseUserDetailsFromIds());
  });

  describe('rendering', () => {
    it('renders SinglePostCard for short posts', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('single-post-card')).toBeInTheDocument();
      expect(screen.getByTestId('single-post-card')).toHaveAttribute('data-post-id', mockPostId);
      expect(screen.getByTestId('single-post-card')).toHaveAttribute('data-tags-layout', 'inline');
      expect(screen.queryByTestId('single-post-article')).not.toBeInTheDocument();
    });

    it('derives side tags layout for the single-post surface when the app is in wide mode', () => {
      useHomeStore.getState().setLayout(LAYOUT.WIDE);

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('single-post-card')).toHaveAttribute('data-tags-layout', 'side');
    });

    it('renders SinglePostArticle for long posts', () => {
      vi.mocked(usePostDetails).mockReturnValue({
        postDetails: {
          id: mockPostId,
          indexed_at: Date.now(),
          kind: 'long' as const,
          uri: 'pubky://author/pub/pubky.app/posts/post123',
          content: '# Article Title\n\nArticle content',
          attachments: [],
          is_moderated: false,
          is_blurred: false,
        } satisfies EnrichedPostDetails,
        isLoading: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('single-post-article')).toBeInTheDocument();
      expect(screen.queryByTestId('single-post-card')).not.toBeInTheDocument();
    });

    it('renders loading text when postDetails is not available', () => {
      vi.mocked(usePostDetails).mockReturnValue({
        postDetails: undefined,
        isLoading: true,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });

    it('renders ThreadTree with showQuickReply=true when parent post is not deleted', () => {
      render(<SinglePostContent postId={mockPostId} />);

      const tree = screen.getByTestId('thread-tree');
      expect(tree).toHaveAttribute('data-show-quick-reply', 'true');
    });

    it('renders ThreadTree with showQuickReply=false when parent post is deleted', () => {
      vi.mocked(usePostDetails).mockReturnValue({
        ...mockUsePostDetails(),
        postDetails: {
          ...mockUsePostDetails().postDetails,
          content: '[DELETED]',
        },
      });

      render(<SinglePostContent postId={mockPostId} />);

      const tree = screen.getByTestId('thread-tree');
      expect(tree).toHaveAttribute('data-show-quick-reply', 'false');
    });

    it('renders PostDeleted component instead of post content when post is deleted', () => {
      vi.mocked(usePostDetails).mockReturnValue({
        ...mockUsePostDetails(),
        postDetails: {
          ...mockUsePostDetails().postDetails,
          content: '[DELETED]',
        },
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('post-deleted')).toBeInTheDocument();
      expect(screen.queryByTestId('single-post-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('single-post-article')).not.toBeInTheDocument();
    });

    it('does not render SinglePostParticipants inside content', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.queryByTestId('single-post-participants')).not.toBeInTheDocument();
    });

    it('renders ThreadTree with correct postId', () => {
      render(<SinglePostContent postId={mockPostId} />);

      const tree = screen.getByTestId('thread-tree');
      expect(tree).toBeInTheDocument();
      expect(tree).toHaveAttribute('data-post-id', mockPostId);
    });
  });

  describe('authentication', () => {
    it('hides replies section when not authenticated', () => {
      vi.mocked(useRequireAuth).mockReturnValue({
        isAuthenticated: false,
        requireAuth: <T,>(_action: () => T) => undefined,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.queryByTestId('thread-tree')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-reply')).not.toBeInTheDocument();
      expect(screen.queryByTestId('single-post-participants')).not.toBeInTheDocument();
    });
  });

  describe('hooks integration', () => {
    it('calls usePostDetails with the correct postId', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(usePostDetails).toHaveBeenCalledWith(mockPostId);
    });
  });
});

describe('SinglePostContent - Snapshots', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(usePostCounts).mockReturnValue(mockUsePostCounts());
    vi.mocked(usePostAncestors).mockReturnValue(mockUsePostAncestors());
    vi.mocked(useUserDetailsFromIds).mockReturnValue(mockUseUserDetailsFromIds());
  });

  it('matches snapshot with short post and no replies', () => {
    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with long post (article)', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: mockPostId,
        indexed_at: Date.now(),
        kind: 'long' as const,
        uri: 'pubky://author/pub/pubky.app/posts/post123',
        content: '# Article Title\n\nArticle content',
        attachments: [],
        is_moderated: false,
        is_blurred: false,
      } satisfies EnrichedPostDetails,
      isLoading: false,
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with deleted parent post', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      ...mockUsePostDetails(),
      postDetails: {
        ...mockUsePostDetails().postDetails,
        content: '[DELETED]',
      },
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when not authenticated', () => {
    vi.mocked(useRequireAuth).mockReturnValue({
      isAuthenticated: false,
      requireAuth: <T,>(_action: () => T) => undefined,
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });
});
