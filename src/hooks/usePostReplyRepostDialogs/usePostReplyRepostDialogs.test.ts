import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePostReplyRepostDialogs } from './usePostReplyRepostDialogs';

describe('usePostReplyRepostDialogs', () => {
  it('initializes both dialogs as closed', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs());

    expect(result.current.replyDialogOpen).toBe(false);
    expect(result.current.repostDialogOpen).toBe(false);
  });

  it('opens only the reply dialog', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs());

    act(() => {
      result.current.openReplyDialog();
    });

    expect(result.current.replyDialogOpen).toBe(true);
    expect(result.current.repostDialogOpen).toBe(false);
  });

  it('opens only the repost dialog', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs());

    act(() => {
      result.current.openRepostDialog();
    });

    expect(result.current.replyDialogOpen).toBe(false);
    expect(result.current.repostDialogOpen).toBe(true);
  });

  it('allows callers to close dialogs with the returned setters', () => {
    const { result } = renderHook(() => usePostReplyRepostDialogs());

    act(() => {
      result.current.openReplyDialog();
      result.current.openRepostDialog();
    });

    expect(result.current.replyDialogOpen).toBe(true);
    expect(result.current.repostDialogOpen).toBe(true);

    act(() => {
      result.current.setReplyDialogOpen(false);
      result.current.setRepostDialogOpen(false);
    });

    expect(result.current.replyDialogOpen).toBe(false);
    expect(result.current.repostDialogOpen).toBe(false);
  });
});
