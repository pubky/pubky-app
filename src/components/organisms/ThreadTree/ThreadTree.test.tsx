import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadReplies } from '@/hooks/useThreadReplies/useThreadReplies';
import { ThreadTree } from './ThreadTree';

vi.mock('@/hooks/useThreadReplies/useThreadReplies', () => ({
  useThreadReplies: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/organisms/QuickReply/QuickReply', () => {
  return {
    QuickReply: ({ parentPostId, connectorVariant = 'last' }: { parentPostId: string; connectorVariant?: string }) => (
      <div data-testid="quick-reply" data-parent-post-id={parentPostId} data-connector-variant={connectorVariant} />
    ),
  };
});

vi.mock('@/organisms/ReplyWithNested/ReplyWithNested', () => {
  return {
    ReplyWithNested: ({ replyId, isLastReply }: { replyId: string; isLastReply: boolean }) => (
      <div data-testid="reply-with-nested" data-reply-id={replyId} data-is-last-reply={String(isLastReply)} />
    ),
  };
});

vi.mock('@/molecules/ShowMoreReplies/ShowMoreReplies', () => {
  return {
    ShowMoreReplies: ({ count, isLast, onClick }: { count: number; isLast: boolean; onClick: () => void }) => (
      <button
        type="button"
        data-testid="show-more-replies"
        data-post-list-card="true"
        data-count={String(count)}
        data-is-last={String(isLast)}
        onClick={onClick}
      >
        show more
      </button>
    ),
  };
});

describe('ThreadTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a terminal quick reply when there are no replies', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: [],
      totalCount: 0,
      hasMore: false,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={true} />);

    expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-parent-post-id', 'author:post-1');
    expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-connector-variant', 'last');
    expect(screen.queryByTestId('reply-with-nested')).not.toBeInTheDocument();
  });

  it('renders null when no replies and quick reply is disabled', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: [],
      totalCount: 0,
      hasMore: false,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    const { container } = render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders quick reply before replies and makes show-more terminal', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      totalCount: 5,
      hasMore: true,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={true} />);

    const quickReply = screen.getByTestId('quick-reply');
    const replies = screen.getAllByTestId('reply-with-nested');
    expect(replies).toHaveLength(2);
    expect(quickReply).toHaveAttribute('data-connector-variant', 'regular');
    expect(quickReply.compareDocumentPosition(replies[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(replies[0]).toHaveAttribute('data-reply-id', 'author:reply-1');
    expect(replies[1]).toHaveAttribute('data-reply-id', 'author:reply-2');
    expect(replies[1]).toHaveAttribute('data-is-last-reply', 'false');
    expect(screen.getByTestId('show-more-replies')).toHaveAttribute('data-count', '3');
    expect(screen.getByTestId('show-more-replies')).toHaveAttribute('data-is-last', 'true');
  });

  it('makes the final reply terminal when quick reply appears before it', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      totalCount: 2,
      hasMore: false,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={true} />);

    const quickReply = screen.getByTestId('quick-reply');
    const replies = screen.getAllByTestId('reply-with-nested');
    expect(quickReply).toHaveAttribute('data-connector-variant', 'regular');
    expect(quickReply.compareDocumentPosition(replies[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(replies[0]).toHaveAttribute('data-is-last-reply', 'false');
    expect(replies[1]).toHaveAttribute('data-is-last-reply', 'true');
  });

  it('renders a reply-only layout when quick reply is disabled', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 1,
      hasMore: false,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    expect(screen.queryByTestId('quick-reply')).not.toBeInTheDocument();
    expect(screen.getByTestId('reply-with-nested')).toHaveAttribute('data-is-last-reply', 'true');
  });

  it('keeps reply cards tabbable and uses total reply count for aria-setsize', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      totalCount: 5,
      hasMore: true,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('tabindex', '0');
    expect(cards[1]).toHaveAttribute('tabindex', '0');
    expect(cards[0]).toHaveAttribute('aria-setsize', '5');
    expect(cards[1]).toHaveAttribute('aria-setsize', '5');
  });

  it('calls expandAll when show-more is clicked', () => {
    const expandAll = vi.fn(async () => {});
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 2,
      hasMore: true,
      showAll: false,
      isExpandingAll: false,
      expandAll,
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);
    fireEvent.click(screen.getByTestId('show-more-replies'));

    expect(expandAll).toHaveBeenCalledTimes(1);
  });

  it('moves focus between reply cards with j/k keys', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      totalCount: 2,
      hasMore: false,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    const cards = screen.getAllByRole('article');
    cards[0].focus();
    expect(document.activeElement).toBe(cards[0]);

    fireEvent.keyDown(cards[0], { key: 'j' });
    expect(document.activeElement).toBe(cards[1]);

    fireEvent.keyDown(cards[1], { key: 'k' });
    expect(document.activeElement).toBe(cards[0]);
  });

  it('moves focus to "show more replies" with j and allows expanding', () => {
    const expandAll = vi.fn(async () => {});
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 6,
      hasMore: true,
      showAll: false,
      isExpandingAll: false,
      expandAll,
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    const card = screen.getByRole('article');
    const showMoreButton = screen.getByTestId('show-more-replies');

    card.focus();
    expect(document.activeElement).toBe(card);

    fireEvent.keyDown(card, { key: 'j' });
    expect(document.activeElement).toBe(showMoreButton);

    fireEvent.click(showMoreButton);
    expect(expandAll).toHaveBeenCalledTimes(1);
  });

  it('hides show-more and makes the final visible reply terminal while expand-all is in progress', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 2,
      hasMore: true,
      showAll: true,
      isExpandingAll: true,
      expandAll: vi.fn(async () => {}),
    });

    render(<ThreadTree postId="author:post-1" showQuickReply={false} />);

    expect(screen.queryByTestId('show-more-replies')).not.toBeInTheDocument();
    expect(screen.getByTestId('reply-with-nested')).toHaveAttribute('data-is-last-reply', 'true');
  });
});

describe('ThreadTree - Snapshots', () => {
  it('matches snapshot with replies and show-more', () => {
    vi.mocked(useThreadReplies).mockReturnValue({
      replyIds: ['author:reply-1'],
      totalCount: 2,
      hasMore: true,
      showAll: false,
      isExpandingAll: false,
      expandAll: vi.fn(async () => {}),
    });

    const { container } = render(<ThreadTree postId="author:post-1" showQuickReply={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
