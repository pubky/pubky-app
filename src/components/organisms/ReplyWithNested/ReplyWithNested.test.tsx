import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMainLayoutProvider, usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';
import { ReplyWithNested } from './ReplyWithNested';

const mocks = vi.hoisted(() => ({
  mockUseNestedReplies: vi.fn(),
}));

vi.mock('@/hooks/useNestedReplies/useNestedReplies', () => ({
  useNestedReplies: (...args: unknown[]) => {
    // Depth-aware: only return nested replies at depth 0 to prevent infinite recursion
    const options = args[1] as { depth?: number } | undefined;
    if (options?.depth && options.depth > 0) {
      return {
        nestedReplyIds: [],
        hasMoreReplies: false,
        hasNestedReplies: false,
        replyCount: 0,
        showAll: false,
        isExpandingAll: false,
        expandAll: vi.fn(async () => {}),
      };
    }
    return mocks.mockUseNestedReplies(...args);
  },
}));

vi.mock('@/hooks/useNestedReplies/useNestedReplies.constants', () => ({
  DEFAULT_MAX_DEPTH: 3,
  AUTO_COLLAPSE_THRESHOLD: 4,
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({
    getPostHref: vi.fn(() => '/post/author/reply'),
    navigateToPost: vi.fn(),
    handlePostClick: vi.fn(),
    handlePostAuxClick: vi.fn(),
    handlePostKeyDown: vi.fn(),
  }),
}));

vi.mock('@/atoms/PostThreadSpacer/PostThreadSpacer', () => {
  return {
    PostThreadSpacer: () => <div data-testid="post-thread-spacer" />,
  };
});

vi.mock('@/organisms/PostMain/PostMain', () => {
  return {
    PostMain: ({ postId, isLastReply }: { postId: string; isLastReply: boolean }) => {
      const tagsLayout = usePostMainLayout();

      return (
        <div
          data-testid="post-main"
          data-post-id={postId}
          data-is-last-reply={String(isLastReply)}
          data-tags-layout={tagsLayout}
        >
          {postId}
        </div>
      );
    },
  };
});

vi.mock('@/molecules/ShowMoreReplies/ShowMoreReplies', () => {
  return {
    ShowMoreReplies: ({ count, onClick }: { count: number; onClick: () => void }) => (
      <button type="button" data-testid="show-more-nested" data-count={String(count)} onClick={onClick}>
        show more
      </button>
    ),
  };
});

vi.mock('@/molecules/ThreadExpandToggle/ThreadExpandToggle', () => {
  return {
    ThreadExpandToggle: ({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) => (
      <button type="button" data-testid="thread-expand-toggle" data-expanded={String(expanded)} onClick={onToggle}>
        toggle
      </button>
    ),
  };
});

describe('ReplyWithNested', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2'],
      hasMoreReplies: false,
      hasNestedReplies: true,
      replyCount: 2,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });
  });

  it('auto-expands when replyCount <= 3', () => {
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2'],
      hasMoreReplies: false,
      hasNestedReplies: true,
      replyCount: 2,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ReplyWithNested replyId="author:reply-1" />);

    expect(screen.getByText('author:nested-1')).toBeInTheDocument();
    expect(screen.getByText('author:nested-2')).toBeInTheDocument();
  });

  it('auto-collapses when replyCount >= 4', () => {
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2', 'author:nested-3', 'author:nested-4'],
      hasMoreReplies: false,
      hasNestedReplies: true,
      replyCount: 4,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    const { container } = render(<ReplyWithNested replyId="author:reply-1" />);

    // Content is in the DOM but visually collapsed via CSS grid animation
    const gridContainer = container.querySelector('.grid-rows-\\[0fr\\]');
    expect(gridContainer).toBeInTheDocument();
  });

  it('toggles expand/collapse on toggle click', () => {
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2', 'author:nested-3', 'author:nested-4'],
      hasMoreReplies: false,
      hasNestedReplies: true,
      replyCount: 4,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    const { container } = render(<ReplyWithNested replyId="author:reply-1" />);

    // Starts collapsed
    expect(container.querySelector('.grid-rows-\\[0fr\\]')).toBeInTheDocument();

    // Click toggle to expand
    fireEvent.click(screen.getByTestId('thread-expand-toggle'));
    expect(container.querySelector('.grid-rows-\\[1fr\\]')).toBeInTheDocument();

    // Click toggle to collapse again
    fireEvent.click(screen.getByTestId('thread-expand-toggle'));
    expect(container.querySelector('.grid-rows-\\[0fr\\]')).toBeInTheDocument();
  });

  it('shows expand toggle when reply has nested replies', () => {
    render(<ReplyWithNested replyId="author:reply-1" />);

    expect(screen.getByTestId('thread-expand-toggle')).toBeInTheDocument();
  });

  it('does not show expand toggle when no nested replies', () => {
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: [],
      hasMoreReplies: false,
      hasNestedReplies: false,
      replyCount: 0,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ReplyWithNested replyId="author:reply-1" />);

    expect(screen.queryByTestId('thread-expand-toggle')).not.toBeInTheDocument();
  });

  it('renders show-more count when expanded with more replies', () => {
    const expandAll = vi.fn(async () => {});
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2'],
      hasMoreReplies: true,
      hasNestedReplies: true,
      replyCount: 3,
      showAll: false,
      isExpandingAll: false,
      expandAll,
    });

    render(<ReplyWithNested replyId="author:reply-1" />);

    expect(screen.getByTestId('show-more-nested')).toHaveAttribute('data-count', '1');
    fireEvent.click(screen.getByTestId('show-more-nested'));
    expect(expandAll).toHaveBeenCalledTimes(1);
  });

  it('hides show-more while expand-all is in progress', () => {
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2'],
      hasMoreReplies: true,
      hasNestedReplies: true,
      replyCount: 3,
      showAll: true,
      isExpandingAll: true,
      expandAll: vi.fn(async () => {}),
    });

    render(<ReplyWithNested replyId="author:reply-1" />);

    expect(screen.queryByTestId('show-more-nested')).not.toBeInTheDocument();
  });

  it('makes nested replies individually tabbable', () => {
    render(<ReplyWithNested replyId="author:reply-1" />);

    // Top-level reply remains controlled by ThreadTree wrapper.
    // Nested replies (depth > 0) should each be keyboard-focusable.
    const nestedArticles = screen.getAllByRole('article');
    expect(nestedArticles).toHaveLength(2);
    nestedArticles.forEach((article) => {
      expect(article).toHaveAttribute('tabindex', '0');
      expect(article).toHaveAttribute('data-post-list-card', 'true');
    });
  });

  it('applies min-w-0 to the nested sub-reply column so long usernames truncate', () => {
    render(<ReplyWithNested replyId="author:reply-1" />);

    const nestedPost = screen.getByText('author:nested-1');
    const nestedColumn = nestedPost.closest('.flex-1.min-w-0');
    expect(nestedColumn).toBeInTheDocument();
  });

  it('passes depth options to useNestedReplies', () => {
    // depth=0 so the mock wrapper passes through to mockUseNestedReplies
    render(<ReplyWithNested replyId="author:reply-1" depth={0} maxDepth={2} />);

    expect(mocks.mockUseNestedReplies).toHaveBeenCalledWith('author:reply-1', {
      depth: 0,
      maxDepth: 2,
    });
  });

  it('inherits side layout for the full nested reply tree from the thread context', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <ReplyWithNested replyId="author:reply-1" />
      </PostMainLayoutProvider>,
    );

    const postCards = screen.getAllByTestId('post-main');
    expect(postCards).toHaveLength(3);
    for (const postCard of postCards) {
      expect(postCard).toHaveAttribute('data-tags-layout', 'side');
    }
  });
});

describe('ReplyWithNested - Snapshots', () => {
  it('matches snapshot for expanded nested replies', () => {
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1'],
      hasMoreReplies: false,
      hasNestedReplies: true,
      replyCount: 1,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    const { container } = render(<ReplyWithNested replyId="author:reply-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
