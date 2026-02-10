import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplyWithNested } from './ReplyWithNested';

const mocks = vi.hoisted(() => ({
  mockUseThreadTreeContext: vi.fn(),
  mockUseNestedReplies: vi.fn(),
  mockOnPostClick: vi.fn(),
}));

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useThreadTreeContext: mocks.mockUseThreadTreeContext,
    useNestedReplies: mocks.mockUseNestedReplies,
  };
});

vi.mock('@/organisms', async () => {
  const actual = await vi.importActual<typeof import('@/organisms')>('@/organisms');
  return {
    ...actual,
    PostMain: ({ postId, isLastReply, onClick }: { postId: string; isLastReply: boolean; onClick: () => void }) => (
      <button
        type="button"
        data-testid="post-main"
        data-post-id={postId}
        data-is-last-reply={String(isLastReply)}
        onClick={onClick}
      >
        {postId}
      </button>
    ),
  };
});

vi.mock('@/molecules', async () => {
  const actual = await vi.importActual<typeof import('@/molecules')>('@/molecules');
  return {
    ...actual,
    ThreadExpandToggle: () => <div data-testid="thread-expand-toggle" />,
    ShowMoreReplies: ({ count, onClick }: { count: number; onClick: () => void }) => (
      <button type="button" data-testid="show-more-nested" data-count={String(count)} onClick={onClick}>
        show more
      </button>
    ),
  };
});

describe('ReplyWithNested', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockOnPostClick.mockReset();
    mocks.mockUseThreadTreeContext.mockReturnValue({
      allLevel2Expanded: true,
      toggleAllLevel2: vi.fn(),
    });
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2'],
      hasMoreReplies: true,
      hasNestedReplies: true,
      replyCount: 5,
      showAll: false,
      expandAll: vi.fn(),
    });
  });

  it('hides nested section when thread is collapsed', () => {
    mocks.mockUseThreadTreeContext.mockReturnValue({
      allLevel2Expanded: false,
      toggleAllLevel2: vi.fn(),
    });

    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

    expect(screen.getByText('author:reply-1')).toBeInTheDocument();
    expect(screen.queryByText('author:nested-1')).not.toBeInTheDocument();
  });

  it('renders nested replies and show-more count when expanded', () => {
    const expandAll = vi.fn();
    mocks.mockUseNestedReplies.mockReturnValue({
      nestedReplyIds: ['author:nested-1', 'author:nested-2'],
      hasMoreReplies: true,
      hasNestedReplies: true,
      replyCount: 4,
      showAll: false,
      expandAll,
    });

    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} isLastReply={false} />);

    expect(screen.getByText('author:nested-1')).toBeInTheDocument();
    expect(screen.getByText('author:nested-2')).toBeInTheDocument();
    expect(screen.getByTestId('show-more-nested')).toHaveAttribute('data-count', '2');
    fireEvent.click(screen.getByTestId('show-more-nested'));
    expect(expandAll).toHaveBeenCalledTimes(1);
  });

  it('renders thread expand toggle when requested', () => {
    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} showExpandToggle={true} />);

    expect(screen.getByTestId('thread-expand-toggle')).toBeInTheDocument();
  });

  it('wires onPostClick for main and nested posts', () => {
    render(<ReplyWithNested replyId="author:reply-1" onPostClick={mocks.mockOnPostClick} />);

    fireEvent.click(screen.getByText('author:reply-1'));
    fireEvent.click(screen.getByText('author:nested-1'));

    expect(mocks.mockOnPostClick).toHaveBeenCalledWith('author:reply-1');
    expect(mocks.mockOnPostClick).toHaveBeenCalledWith('author:nested-1');
  });

  it('passes depth options to useNestedReplies', () => {
    render(
      <ReplyWithNested
        replyId="author:reply-1"
        onPostClick={mocks.mockOnPostClick}
        maxNestedReplies={7}
        depth={1}
        maxDepth={2}
      />,
    );

    expect(mocks.mockUseNestedReplies).toHaveBeenCalledWith('author:reply-1', {
      maxNestedReplies: 7,
      depth: 1,
      maxDepth: 2,
    });
  });
});

describe('ReplyWithNested - Snapshots', () => {
  it('matches snapshot for expanded nested replies', () => {
    const { container } = render(<ReplyWithNested replyId="author:reply-1" onPostClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
