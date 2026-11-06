import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IFRAME_MOUNT_TIMEOUT_MS, IFRAME_READY_AFTER_LOAD_MS, useIframeReady } from './useIframeReady';
import type { UseIframeReadyParams } from './useIframeReady.types';

const READY = 'page-ready';
const PAGE_URL = 'https://embed.example/page?state=one';
const OTHER_PAGE_URL = 'https://embed.example/page?state=two';

const isReadyMessage = (event: MessageEvent) => (event.data as { type?: string } | null)?.type === READY;

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const post = (data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  });

type Props = Partial<UseIframeReadyParams>;

/** Renders the hook; every render passes fresh inline callbacks, as the flow hooks do. */
const renderIframeReady = (initial: Props = {}) => {
  const onTimeout = vi.fn();
  const readyCheck = vi.fn(isReadyMessage);
  const view = renderHook(
    (props: Props) =>
      useIframeReady({
        key: PAGE_URL,
        isWaiting: true,
        isReadyMessage: (event) => readyCheck(event),
        onTimeout: (countedFrom) => onTimeout(countedFrom),
        ...props,
      }),
    { initialProps: initial },
  );
  return { ...view, onTimeout, readyCheck };
};

describe('useIframeReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('becomes ready on the first accepted message and never times out', async () => {
    const { result, onTimeout } = renderIframeReady();
    expect(result.current.isReady).toBe(false);

    post({ type: 'something-else' });
    expect(result.current.isReady).toBe(false);
    post({ type: READY });
    expect(result.current.isReady).toBe(true);

    await advance(IFRAME_MOUNT_TIMEOUT_MS + IFRAME_READY_AFTER_LOAD_MS);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('times out IFRAME_READY_AFTER_LOAD_MS after load', async () => {
    const { result, onTimeout } = renderIframeReady();
    act(() => result.current.onLoad());

    await advance(IFRAME_READY_AFTER_LOAD_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    await advance(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('load');
  });

  it('times out IFRAME_MOUNT_TIMEOUT_MS after the wait began when load never fires', async () => {
    const { onTimeout } = renderIframeReady();

    await advance(IFRAME_MOUNT_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    await advance(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('mount');
  });

  // The flow hooks are skipped by the React Compiler, so their inline callbacks get a new identity on
  // every render. A re-render mid-wait must not restart either timer.
  it('keeps both timers on schedule across re-renders with new callbacks', async () => {
    const { result, rerender, onTimeout } = renderIframeReady();

    await advance(IFRAME_MOUNT_TIMEOUT_MS - IFRAME_READY_AFTER_LOAD_MS - 1_000);
    rerender({});
    act(() => result.current.onLoad());
    await advance(IFRAME_READY_AFTER_LOAD_MS - 1_000);
    rerender({});
    await advance(999);
    rerender({});
    expect(onTimeout).not.toHaveBeenCalled();

    // 5 s after load, and 1 s before the mount limit: the load timer fires, unrestarted.
    await advance(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenLastCalledWith('load');
  });

  it('keeps the mount timer on schedule across re-renders before load', async () => {
    const { rerender, onTimeout } = renderIframeReady();

    for (let elapsed = 0; elapsed < IFRAME_MOUNT_TIMEOUT_MS - 1; elapsed += 4_000) {
      await advance(Math.min(4_000, IFRAME_MOUNT_TIMEOUT_MS - 1 - elapsed));
      rerender({});
    }
    expect(onTimeout).not.toHaveBeenCalled();
    await advance(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('mount');
  });

  it('uses the latest callbacks when the timer fires', async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderIframeReady({ onTimeout: first });
    rerender({ onTimeout: latest });

    await advance(IFRAME_MOUNT_TIMEOUT_MS);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith('mount');
  });

  it('starts a fresh wait for a new key: the old ready report and load do not carry over', async () => {
    const { result, rerender, onTimeout } = renderIframeReady();
    act(() => result.current.onLoad());
    post({ type: READY });
    expect(result.current.isReady).toBe(true);

    rerender({ key: OTHER_PAGE_URL });
    expect(result.current.isReady).toBe(false);

    // No load yet for the new page, so only the mount limit runs.
    await advance(IFRAME_READY_AFTER_LOAD_MS);
    expect(onTimeout).not.toHaveBeenCalled();
    await advance(IFRAME_MOUNT_TIMEOUT_MS - IFRAME_READY_AFTER_LOAD_MS);
    expect(onTimeout).toHaveBeenCalledWith('mount');
  });

  it('does nothing while not waiting or without a page', async () => {
    const { result, onTimeout, readyCheck } = renderIframeReady({ isWaiting: false });
    act(() => result.current.onLoad());
    post({ type: READY });
    await advance(IFRAME_MOUNT_TIMEOUT_MS);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(readyCheck).not.toHaveBeenCalled();
    expect(result.current.isReady).toBe(false);

    const noPage = renderIframeReady({ key: null });
    await advance(IFRAME_MOUNT_TIMEOUT_MS);
    expect(noPage.onTimeout).not.toHaveBeenCalled();
    expect(noPage.result.current.isReady).toBe(false);
  });
});
