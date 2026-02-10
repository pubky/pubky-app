import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreadTree } from './ThreadTree';

vi.mock('@/organisms', async () => {
  const actual = await vi.importActual<typeof import('@/organisms')>('@/organisms');
  return {
    ...actual,
    QuickReply: ({ parentPostId }: { parentPostId: string }) => (
      <div data-testid="quick-reply" data-parent-post-id={parentPostId} />
    ),
    ReplyWithNested: ({
      replyId,
      isLastReply,
      showExpandToggle,
    }: {
      replyId: string;
      isLastReply: boolean;
      showExpandToggle: boolean;
    }) => (
      <div
        data-testid="reply-with-nested"
        data-reply-id={replyId}
        data-is-last-reply={String(isLastReply)}
        data-show-expand-toggle={String(showExpandToggle)}
      />
    ),
  };
});

vi.mock('@/molecules', async () => {
  const actual = await vi.importActual<typeof import('@/molecules')>('@/molecules');
  return {
    ...actual,
    ShowMoreReplies: ({ count, isLast, onClick }: { count: number; isLast: boolean; onClick: () => void }) => (
      <button
        type="button"
        data-testid="show-more-replies"
        data-count={String(count)}
        data-is-last={String(isLast)}
        onClick={onClick}
      >
        show more
      </button>
    ),
  };
});

import * as Hooks from '@/hooks';

describe('ThreadTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders quick reply only when no replies and quick reply is enabled', () => {
    vi.spyOn(Hooks, 'usePostNavigation').mockReturnValue({
      navigateToPost: vi.fn(),
    });
    vi.spyOn(Hooks, 'useThreadReplies').mockReturnValue({
      replyIds: [],
      totalCount: 0,
      hasMore: false,
      showAll: false,
      expandAll: vi.fn(),
      loading: false,
      hasAnyNestedReplies: false,
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={true} />);

    expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-parent-post-id', 'author:post-1');
    expect(screen.queryByTestId('reply-with-nested')).not.toBeInTheDocument();
  });

  it('renders null when no replies and quick reply is disabled', () => {
    vi.spyOn(Hooks, 'usePostNavigation').mockReturnValue({
      navigateToPost: vi.fn(),
    });
    vi.spyOn(Hooks, 'useThreadReplies').mockReturnValue({
      replyIds: [],
      totalCount: 0,
      hasMore: false,
      showAll: false,
      expandAll: vi.fn(),
      loading: false,
      hasAnyNestedReplies: false,
    });

    const { container } = render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders replies and show-more with expected props', () => {
    const navigateToPost = vi.fn();
    vi.spyOn(Hooks, 'usePostNavigation').mockReturnValue({
      navigateToPost,
    });
    vi.spyOn(Hooks, 'useThreadReplies').mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      totalCount: 5,
      hasMore: true,
      showAll: false,
      expandAll: vi.fn(),
      loading: false,
      hasAnyNestedReplies: true,
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    const replies = screen.getAllByTestId('reply-with-nested');
    expect(replies).toHaveLength(2);
    expect(replies[0]).toHaveAttribute('data-reply-id', 'author:reply-1');
    expect(replies[0]).toHaveAttribute('data-show-expand-toggle', 'true');
    expect(replies[1]).toHaveAttribute('data-show-expand-toggle', 'false');
    expect(screen.getByTestId('show-more-replies')).toHaveAttribute('data-count', '3');
    expect(screen.getByTestId('show-more-replies')).toHaveAttribute('data-is-last', 'true');
  });

  it('calls expandAll when show-more is clicked', () => {
    const expandAll = vi.fn();
    vi.spyOn(Hooks, 'usePostNavigation').mockReturnValue({
      navigateToPost: vi.fn(),
    });
    vi.spyOn(Hooks, 'useThreadReplies').mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 2,
      hasMore: true,
      showAll: false,
      expandAll,
      loading: false,
      hasAnyNestedReplies: false,
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);
    fireEvent.click(screen.getByTestId('show-more-replies'));

    expect(expandAll).toHaveBeenCalledTimes(1);
  });
});

describe('ThreadTree - Snapshots', () => {
  it('matches snapshot with replies and show-more', () => {
    vi.spyOn(Hooks, 'usePostNavigation').mockReturnValue({
      navigateToPost: vi.fn(),
    });
    vi.spyOn(Hooks, 'useThreadReplies').mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 2,
      hasMore: true,
      showAll: false,
      expandAll: vi.fn(),
      loading: false,
      hasAnyNestedReplies: false,
    });

    const { container } = render(<ThreadTree postId="author:post-1" showQuickReply={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
