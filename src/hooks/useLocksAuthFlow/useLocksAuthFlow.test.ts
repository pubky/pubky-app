import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const LOCK_SERVER_ORIGIN = 'https://lock.server';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getConnectUrl: mocks.getConnectUrl,
    isServerReachable: mocks.isServerReachable,
    completeAuthFromCallback: mocks.completeAuthFromCallback,
  },
}));

vi.mock('./useLocksAuthFlow.utils', () => ({
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
});
