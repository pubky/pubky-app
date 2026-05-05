import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockAnimationEvent } from '@/test-utils/react-events';
import { useClosingPresence } from './useClosingPresence';

describe('useClosingPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shouldRender follows open immediately', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useClosingPresence({
          open,
          timeoutMs: 200,
        }),
      { initialProps: { open: false } },
    );

    expect(result.current.shouldRender).toBe(false);

    rerender({ open: true });

    expect(result.current.shouldRender).toBe(true);
  });

  it('beginClosing keeps content rendered after open becomes false', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useClosingPresence({
          open,
          timeoutMs: 200,
        }),
      { initialProps: { open: true } },
    );

    act(() => {
      result.current.beginClosing();
    });
    rerender({ open: false });

    expect(result.current.shouldRender).toBe(true);
  });

  it('onAnimationEnd clears closing state only for the root closed-state animation', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useClosingPresence({
          open,
          timeoutMs: 200,
        }),
      { initialProps: { open: true } },
    );

    act(() => {
      result.current.beginClosing();
    });
    rerender({ open: false });

    const root = document.createElement('div');
    root.setAttribute('data-state', 'closed');

    act(() => {
      result.current.onAnimationEnd(
        mockAnimationEvent<HTMLDivElement>({
          target: root,
          currentTarget: root,
        }),
      );
    });

    expect(result.current.shouldRender).toBe(false);
  });

  it('timeout fallback clears closing state when animation end never arrives', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useClosingPresence({
          open,
          timeoutMs: 200,
        }),
      { initialProps: { open: true } },
    );

    act(() => {
      result.current.beginClosing();
    });
    rerender({ open: false });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.shouldRender).toBe(false);
  });

  it('cleanup clears pending timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() =>
      useClosingPresence({
        open: true,
        timeoutMs: 200,
      }),
    );

    act(() => {
      result.current.beginClosing();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
