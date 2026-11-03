import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IFRAME_MOUNT_TIMEOUT_MS, IFRAME_READY_AFTER_LOAD_MS } from '@/hooks/useIframeReady/useIframeReady';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { ErrorCategory } from '@/libs/error/error.types';
import { useLocksAuthFlow } from './useLocksAuthFlow';
import { LocksAuthFlowStatus } from './useLocksAuthFlow.types';

const mocks = vi.hoisted(() => ({
  getConnectUrl: vi.fn(),
  isServerReachable: vi.fn(),
  completeAuthFromCallback: vi.fn(),
  readBridge: vi.fn(),
  fakeSession: { id: 'locks-session' },
}));

const LOCKS_AUTH_MESSAGE_TYPE = 'locks-auth-callback';
const LOCKS_AUTH_RESIZE_MESSAGE_TYPE = 'locks-auth-resize';
const LOCK_SERVER_ORIGIN = 'https://lock.server';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getConnectUrl: mocks.getConnectUrl,
    isServerReachable: mocks.isServerReachable,
    completeAuthFromCallback: mocks.completeAuthFromCallback,
  },
}));

// The ready check stays real: it is the contract under test in the readiness block below.
vi.mock('./useLocksAuthFlow.utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useLocksAuthFlow.utils')>()),
  readLocksAuthBridgeMessage: mocks.readBridge,
}));

const attachIframeSource = (result: { current: ReturnType<typeof useLocksAuthFlow> }) => {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentWindow', { value: window, configurable: true });
  result.current.iframeRef.current = iframe;
};

const postCallback = async (data: unknown, origin = LOCK_SERVER_ORIGIN) => {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: window }));
  });
};

/** Runs start() and returns the CSRF state the hook generated (captured from getConnectUrl). */
const startFlow = async (result: { current: ReturnType<typeof useLocksAuthFlow> }) => {
  await act(async () => {
    await result.current.start();
  });
  return mocks.getConnectUrl.mock.calls[0][0].state as string;
};

describe('useLocksAuthFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConnectUrl.mockResolvedValue('https://lock.server/connect?delivery=postmessage');
    mocks.isServerReachable.mockResolvedValue(true);
    mocks.completeAuthFromCallback.mockResolvedValue({ session: mocks.fakeSession, secret: 'secret-abc' });
    mocks.readBridge.mockImplementation(
      (event: MessageEvent, expectedSource: MessageEventSource | null, origin: string) => {
        expect(expectedSource).toBe(window);
        if (event.origin !== origin || event.source !== expectedSource) return null;
        const data = event.data as Partial<{ type: string; code: string; state: string; error: string }>;
        if (data.error) return { error: data.error };
        if (data.type === LOCKS_AUTH_MESSAGE_TYPE && data.code && data.state)
          return { code: data.code, state: data.state };
        return null;
      },
    );
  });

  it('treats a superseded account callback as quiet cancellation', async () => {
    mocks.completeAuthFromCallback.mockRejectedValueOnce(createCanceledError());
    const { result } = renderHook(() => useLocksAuthFlow());
    attachIframeSource(result);
    const state = await startFlow(result);
    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });
    expect(result.current.status).toBe(LocksAuthFlowStatus.IDLE);
    expect(result.current.error).toBeNull();
  });
  it.each(['success', 'canceled', 'failed'])(
    'ignores an old exchange completing with %s after reset and restart',
    async (outcome) => {
      const pending = Promise.withResolvers<{ session: typeof mocks.fakeSession; secret: string }>();
      mocks.completeAuthFromCallback.mockReturnValueOnce(pending.promise);
      const { result } = renderHook(() => useLocksAuthFlow());
      attachIframeSource(result);
      const state = await startFlow(result);
      await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });
      act(() => result.current.reset());
      await act(() => result.current.start());
      await act(async () => {
        if (outcome === 'success') pending.resolve({ session: mocks.fakeSession, secret: 'old' });
        else pending.reject(outcome === 'canceled' ? createCanceledError() : new Error('old failure'));
      });
      expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);
      expect(result.current.session).toBeNull();
      expect(result.current.error).toBeNull();
    },
  );
  it('ignores a connect URL that arrives after reset and a newer start', async () => {
    const old = Promise.withResolvers<string>();
    mocks.getConnectUrl.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useLocksAuthFlow());
    let first!: Promise<void>;
    act(() => {
      first = result.current.start();
    });
    act(() => result.current.reset());
    await act(() => result.current.start());
    await act(async () => {
      old.resolve('https://old.lock.server/connect');
      await first;
    });
    expect(result.current.connectUrl).toBe('https://lock.server/connect?delivery=postmessage');
    expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);
  });
  it('starts idle', () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    expect(result.current.status).toBe(LocksAuthFlowStatus.IDLE);
    expect(result.current.connectUrl).toBeNull();
  });

  it('prepare() reaches IDLE (Continue enabled) when the server is reachable', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    await act(async () => {
      await result.current.prepare();
    });

    expect(mocks.isServerReachable).toHaveBeenCalled();
    expect(result.current.status).toBe(LocksAuthFlowStatus.IDLE);
  });

  it('prepare() reaches SERVER_UNAVAILABLE without a connect URL when the server is not reachable', async () => {
    mocks.isServerReachable.mockResolvedValue(false);
    const { result } = renderHook(() => useLocksAuthFlow());
    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.status).toBe(LocksAuthFlowStatus.SERVER_UNAVAILABLE);
    expect(result.current.connectUrl).toBeNull();
  });

  // The modal stays mounted when closed, so a slow check outlives it and must not overwrite a newer one.
  it('ignores a slow server check that answers after a newer one', async () => {
    let resolveSlow: (value: boolean) => void = () => {};
    mocks.isServerReachable
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(false);
    const { result } = renderHook(() => useLocksAuthFlow());

    act(() => void result.current.prepare()); // opened — check A, still in flight
    act(() => result.current.reset()); // closed
    await act(async () => {
      await result.current.prepare(); // reopened — check B says the server is down
    });
    expect(result.current.status).toBe(LocksAuthFlowStatus.SERVER_UNAVAILABLE);

    await act(async () => {
      resolveSlow(true); // check A finally answers "reachable"
    });

    expect(result.current.status).toBe(LocksAuthFlowStatus.SERVER_UNAVAILABLE);
  });

  it('ignores a slow server check that fails after the modal closed', async () => {
    let rejectSlow: (reason: Error) => void = () => {};
    mocks.isServerReachable.mockImplementationOnce(
      () => new Promise<boolean>((_resolve, reject) => (rejectSlow = reject)),
    );
    const { result } = renderHook(() => useLocksAuthFlow());

    act(() => void result.current.prepare());
    act(() => result.current.reset());

    await act(async () => {
      rejectSlow(new Error('pkarr timeout'));
    });

    expect(result.current.status).toBe(LocksAuthFlowStatus.IDLE);
    expect(result.current.error).toBeNull();
  });

  it('start() requests a connect URL with a generated state', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    const state = await startFlow(result);

    expect(mocks.getConnectUrl).toHaveBeenCalledWith({ state: expect.any(String) });
    expect(state).toBeTruthy();
    expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);
    expect(result.current.connectUrl).toBe('https://lock.server/connect?delivery=postmessage');
  });

  it('errors without mounting the iframe when getConnectUrl rejects (e.g. server not ready)', async () => {
    mocks.getConnectUrl.mockRejectedValue(new Error('Lock Server is not ready'));
    const { result } = renderHook(() => useLocksAuthFlow());
    await startFlow(result);

    expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR);
    expect(result.current.connectUrl).toBeNull(); // iframe never loads
  });

  it('exchanges the code and reaches success when the callback state matches', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    const state = await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });

    await waitFor(() => expect(result.current.status).toBe(LocksAuthFlowStatus.SUCCESS));
    expect(mocks.completeAuthFromCallback).toHaveBeenCalledWith({ code: 'CODE', state });
    expect(result.current.session).toBe(mocks.fakeSession);
  });

  it('does not report success for an exchange the controller discarded', async () => {
    mocks.completeAuthFromCallback.mockResolvedValue(null);
    const { result } = renderHook(() => useLocksAuthFlow());
    const state = await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });

    await waitFor(() => expect(mocks.completeAuthFromCallback).toHaveBeenCalled());
    expect(result.current.status).toBe(LocksAuthFlowStatus.IDLE);
    expect(result.current.session).toBeNull();
  });

  it('passes the lock server origin (from the connect URL) to the bridge validator', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    const state = await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });

    await waitFor(() => expect(result.current.status).toBe(LocksAuthFlowStatus.SUCCESS));
    // 3rd arg is the lock server origin derived from the connect URL.
    expect(mocks.readBridge.mock.calls[0][2]).toBe('https://lock.server');
  });

  it('errors on a state mismatch and does NOT exchange', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state: 'a-different-state' });

    await waitFor(() => expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR));
    expect(mocks.completeAuthFromCallback).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it('errors on a failure message and does NOT exchange', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, error: 'connect-failed-410' });

    await waitFor(() => expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR));
    expect(mocks.completeAuthFromCallback).not.toHaveBeenCalled();
  });

  it('ignores invalid bridge messages (readBridge returns null)', async () => {
    const { result } = renderHook(() => useLocksAuthFlow());
    await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: 'other', code: 'CODE', state: 'STATE' });

    expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL); // unchanged
    expect(mocks.completeAuthFromCallback).not.toHaveBeenCalled();
  });

  it('errors when code exchange fails after a valid callback', async () => {
    mocks.completeAuthFromCallback.mockRejectedValueOnce(new Error('exchange failed'));
    const { result } = renderHook(() => useLocksAuthFlow());
    const state = await startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });

    await waitFor(() => expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR));
    expect(mocks.completeAuthFromCallback).toHaveBeenCalledWith({ code: 'CODE', state });
    expect(result.current.error).not.toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('errors when the connect URL cannot be generated', async () => {
    mocks.getConnectUrl.mockRejectedValueOnce(new Error('pkarr resolve failed'));
    const { result } = renderHook(() => useLocksAuthFlow());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR);
    expect(result.current.error).not.toBeNull();
  });

  // #3027: a `/connect` page that failed (a JSON error body, a proxy page) still fires `load` but never
  // posts anything, so the shell's first `locks-auth-resize` report is the only sign it rendered.
  describe('waiting for the /connect page to render', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Each start() carries a fresh `state` in the URL, which keys the wait for the page.
      mocks.getConnectUrl.mockImplementation(async ({ state }: { state: string }) => {
        return `${LOCK_SERVER_ORIGIN}/connect?delivery=postmessage&state=${state}`;
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const advance = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    const fireLoad = (result: { current: ReturnType<typeof useLocksAuthFlow> }) =>
      act(() => result.current.onConnectLoad());
    const postReady = (origin = LOCK_SERVER_ORIGIN) =>
      postCallback({ type: LOCKS_AUTH_RESIZE_MESSAGE_TYPE, height: 192 }, origin);

    it('shows the page once the shell posts its first height report, and keeps waiting for approval', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      await startFlow(result);
      attachIframeSource(result);
      expect(result.current.isConnectReady).toBe(false);

      fireLoad(result);
      await postReady();
      expect(result.current.isConnectReady).toBe(true);

      await advance(IFRAME_MOUNT_TIMEOUT_MS + IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);
      expect(result.current.error).toBeNull();
    });

    it('moves to ERROR when no height report arrives within the limit after the load event', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      await startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await advance(IFRAME_READY_AFTER_LOAD_MS - 1);
      expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);

      await advance(1);
      expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR);
      expect(result.current.error?.category).toBe(ErrorCategory.Timeout);
      expect(result.current.isConnectReady).toBe(false);
    });

    it('moves to ERROR when the page never fires load', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      await startFlow(result);
      attachIframeSource(result);

      await advance(IFRAME_MOUNT_TIMEOUT_MS - 1);
      expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);

      await advance(1);
      expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR);
      expect(result.current.error?.category).toBe(ErrorCategory.Timeout);
    });

    it('exchanges the code when the callback follows the ready report', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      const state = await startFlow(result);
      attachIframeSource(result);
      fireLoad(result);
      await postReady();

      await advance(IFRAME_MOUNT_TIMEOUT_MS); // the creator takes a while to scan
      await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });

      expect(result.current.status).toBe(LocksAuthFlowStatus.SUCCESS);
      expect(mocks.completeAuthFromCallback).toHaveBeenCalledWith({ code: 'CODE', state });
    });

    it('accepts a callback that arrives before any height report', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      const state = await startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await postCallback({ type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state });
      await advance(IFRAME_MOUNT_TIMEOUT_MS);

      expect(result.current.status).toBe(LocksAuthFlowStatus.SUCCESS);
    });

    it('does not count a height report from another origin as ready', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      await startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await postReady('https://evil.example');
      expect(result.current.isConnectReady).toBe(false);

      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR);
    });

    it('waits for a fresh ready report after Try again', async () => {
      const { result } = renderHook(() => useLocksAuthFlow());
      await startFlow(result);
      attachIframeSource(result);
      fireLoad(result);
      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(LocksAuthFlowStatus.ERROR);

      await act(() => result.current.start());
      expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);
      expect(result.current.error).toBeNull();
      expect(result.current.isConnectReady).toBe(false);

      // The new page gets its own limits: the old load does not carry over.
      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(LocksAuthFlowStatus.AWAITING_APPROVAL);
      fireLoad(result);
      await postReady();
      expect(result.current.isConnectReady).toBe(true);
    });
  });
});
