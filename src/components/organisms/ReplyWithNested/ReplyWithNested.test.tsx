import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplyWithNested } from './ReplyWithNested';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayout';

const mocks = vi.hoisted(() => ({
  mockUseNestedReplies: vi.fn(),
  mockOnPostClick: vi.fn(),
}));

vi.mock('@/hooks', () => ({
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

vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  PostThreadSpacer: () => <div data-testid="post-thread-spacer" />,
}));

vi.mock('@/organisms', async () => {
  const { usePostMainLayout } = await import('@/organisms/PostMain/PostMainLayout');

  return {
    PostMain: ({ postId, isLastReply, onClick }: { postId: string; isLastReply: boolean; onClick: () => void }) => {
      const tagsLayout = usePostMainLayout();

      return (
        <button
          type="button"
          data-testid="post-main"
          data-post-id={postId}
          data-is-last-reply={String(isLastReply)}
          data-tags-layout={tagsLayout}
          onClick={onClick}
        >
          {postId}
        </button>
      );
    },
  };
});

vi.mock('@/molecules', () => ({
  ThreadExpandToggle: ({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) => (
    <button type="button" data-testid="thread-expand-toggle" data-expanded={String(expanded)} onClick={onToggle}>
      toggle
    </button>
  ),
  ShowMoreReplies: ({ count, onClick }: { count: number; onClick: () => void }) => (
    <button type="button" data-testid="show-more-nested" data-count={String(count)} onClick={onClick}>
      show more
    </button>
  ),
}));

describe('ReplyWithNested', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockOnPostClick.mockReset();
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

    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

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

    const { container } = render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

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

    const { container } = render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

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
    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

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

    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

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

    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

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

    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

    expect(screen.queryByTestId('show-more-nested')).not.toBeInTheDocument();
  });

  it('wires onPostClick for main post', () => {
    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

    fireEvent.click(screen.getByText('author:reply-1'));
    expect(mocks.mockOnPostClick).toHaveBeenCalledWith('author:reply-1');
  });

  it('applies min-w-0 to the nested sub-reply column so long usernames truncate', () => {
    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

    const nestedPost = screen.getByText('author:nested-1');
    const nestedColumn = nestedPost.closest('.flex-1.min-w-0');
    expect(nestedColumn).toBeInTheDocument();
  });

  it('passes depth options to useNestedReplies', () => {
    // depth=0 so the mock wrapper passes through to mockUseNestedReplies
    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} depth={0} maxDepth={2} />);

    expect(mocks.mockUseNestedReplies).toHaveBeenCalledWith('author:reply-1', {
      depth: 0,
      maxDepth: 2,
    });
  });

  it('inherits side layout for the full nested reply tree from the thread context', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />
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

    const { container } = render(<ReplyWithNested replyId="author:reply-1" onPostClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
