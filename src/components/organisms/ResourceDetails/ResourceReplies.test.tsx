import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UseResourceRepliesResult } from '@/hooks/useResourceReplies/useResourceReplies';
import { ResourceReplies } from './ResourceReplies';

const mocks = vi.hoisted(() => ({ view: vi.fn() }));

// The thread's markup has its own test (ThreadTree): here only what it is given matters.
vi.mock('@/organisms/ThreadTree/ThreadTree', () => ({
  ThreadTreeView: (props: { quickReply: unknown; replies: { replyIds: string[] } }) => {
    mocks.view(props);
    return <div data-testid="thread-view" data-replies={props.replies.replyIds.join(',')} />;
  },
}));

const replies = (overrides: Partial<UseResourceRepliesResult> = {}): UseResourceRepliesResult => ({
  replyIds: ['a:1', 'b:2'],
  totalCount: 2,
  replyCount: 2,
  hasMore: false,
  showAll: false,
  isExpandingAll: false,
  expandAll: vi.fn(),
  addReply: vi.fn(),
  ...overrides,
});

describe('ResourceReplies', () => {
  it('shows the replies in the post page’s thread, with a quick reply whose parent is the link', () => {
    const read = replies();
    render(<ResourceReplies uri="https://example.com/a" replies={read} />);

    expect(screen.getByTestId('thread-view')).toHaveAttribute('data-replies', 'a:1,b:2');
    expect(mocks.view).toHaveBeenLastCalledWith(
      expect.objectContaining({ quickReply: { parentUri: 'https://example.com/a' }, onReplySubmitted: read.addReply }),
    );
  });

  it('offers no composer for a link a reply cannot name as its parent', () => {
    render(<ResourceReplies uri="pubky://someone/pub/app/thing" replies={replies()} />);

    expect(mocks.view).toHaveBeenLastCalledWith(expect.objectContaining({ quickReply: null }));
  });

  it('offers no composer for a link with credentials, which a reply would publish', () => {
    render(<ResourceReplies uri="https://user:secret@example.com/a" replies={replies()} />);

    expect(mocks.view).toHaveBeenLastCalledWith(expect.objectContaining({ quickReply: null }));
  });
});
