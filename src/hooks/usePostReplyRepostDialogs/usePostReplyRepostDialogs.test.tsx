import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePostReplyRepostDialogs } from './usePostReplyRepostDialogs';

vi.mock('@/organisms/DialogReply/DialogReply', () => ({
  DialogReply: ({
    postId,
    open,
    onOpenChangeAction,
  }: {
    postId: string;
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
  }) => (
    <div data-testid="dialog-reply" data-post-id={postId} data-open={open}>
      <button data-testid="close-reply-dialog" onClick={() => onOpenChangeAction(false)}>
        Close Reply
      </button>
    </div>
  ),
}));

vi.mock('@/organisms/DialogRepost/DialogRepost', () => ({
  DialogRepost: ({
    postId,
    open,
    onOpenChangeAction,
  }: {
    postId: string;
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
  }) => (
    <div data-testid="dialog-repost" data-post-id={postId} data-open={open}>
      <button data-testid="close-repost-dialog" onClick={() => onOpenChangeAction(false)}>
        Close Repost
      </button>
    </div>
  ),
}));

describe('usePostReplyRepostDialogs', () => {
  it('renders both dialogs closed initially', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs('author:post-id'));

    render(result.current.dialogs);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-post-id', 'author:post-id');
    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-post-id', 'author:post-id');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
  });

  it('opens only the reply dialog', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs('author:post-id'));
    const view = render(result.current.dialogs);

    act(() => {
      result.current.openReplyDialog();
    });
    view.rerender(result.current.dialogs);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
  });

  it('opens only the repost dialog', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs('author:post-id'));
    const view = render(result.current.dialogs);

    act(() => {
      result.current.openRepostDialog();
    });
    view.rerender(result.current.dialogs);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');
  });

  it('allows dialogs to close through their open-change handlers', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs('author:post-id'));
    const view = render(result.current.dialogs);

    act(() => {
      result.current.openReplyDialog();
      result.current.openRepostDialog();
    });
    view.rerender(result.current.dialogs);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('close-reply-dialog'));
    fireEvent.click(screen.getByTestId('close-repost-dialog'));
    view.rerender(result.current.dialogs);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
  });
});
