import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { usePaykitSetupFlow } from './usePaykitSetupFlow';
import { PaykitSetupFlowStatus } from './usePaykitSetupFlow.types';

const mocks = vi.hoisted(() => ({
  getPaykitSetupUrl: vi.fn(),
  markPaykitConnected: vi.fn(),
  fetchPaykitSetupStatus: vi.fn(),
  readBridge: vi.fn(),
}));

const PAYKIT_SETUP_MESSAGE_TYPE = 'paykit-setup-callback';
const PAYKIT_ORIGIN = 'https://paykit.server';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getPaykitSetupUrl: mocks.getPaykitSetupUrl,
    markPaykitConnected: mocks.markPaykitConnected,
    fetchPaykitSetupStatus: mocks.fetchPaykitSetupStatus,
  },
}));

vi.mock('./usePaykitSetupFlow.utils', () => ({
  readPaykitSetupBridgeMessage: mocks.readBridge,
}));

const attachIframeSource = (result: { current: ReturnType<typeof usePaykitSetupFlow> }) => {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentWindow', { value: window, configurable: true });
  result.current.iframeRef.current = iframe;
};

const postCallback = async (data: unknown, origin = PAYKIT_ORIGIN) => {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: window }));
  });
};

/** Runs start() and returns the CSRF state the hook generated (captured from getPaykitSetupUrl). */
const startFlow = (result: { current: ReturnType<typeof usePaykitSetupFlow> }) => {
  act(() => {
    result.current.start();
  });
  return mocks.getPaykitSetupUrl.mock.calls[0][0].state as string;
};

describe('usePaykitSetupFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLocksAuthStore.setState({ ...locksAuthInitialState, locksSessionSecret: 'secret-abc' });
    mocks.getPaykitSetupUrl.mockReturnValue(`${PAYKIT_ORIGIN}/setup?return_to=https://app.example&state=STATE`);
    mocks.readBridge.mockImplementation((_event: MessageEvent, _source: MessageEventSource | null, _origin: string) => {
      const data = _event.data as Partial<{ state: string; error: string }>;
      return data.error ? { state: data.state, error: data.error } : { state: data.state };
    });
  });

  it('starts idle', () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    expect(result.current.setupUrl).toBeNull();
  });

  it('start exposes the setup URL and waits for approval', () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    startFlow(result);

    expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
    expect(result.current.setupUrl).toContain(`${PAYKIT_ORIGIN}/setup`);
  });

  it('records the connection on a matching success callback', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.markPaykitConnected).toHaveBeenCalledOnce();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
  });

  it('fails on a failure callback without recording a connection', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state, error: 'setup-failed' });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
  });

  it('fails when the callback state does not match the one it sent', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state' });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
  });

  it('fails when the Locks session changed while setup was open', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);
    useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
  });

  it('stays waiting when the bridge rejects the message', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);
    mocks.readBridge.mockReturnValueOnce(null);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state }, 'https://evil.example');

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
  });

  it('hands the bridge the iframe window and the Paykit origin to validate against', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.readBridge).toHaveBeenCalledWith(expect.anything(), window, PAYKIT_ORIGIN);
  });

  // [3] The listener is one-shot: a replayed callback must not connect a second time.
  it('accepts only the first callback, ignoring a replay', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);

    // Both in one act(): across two, the status change alone tears the listener down, so the
    // assertion would hold even without the one-shot removal.
    const event = () =>
      new MessageEvent('message', {
        data: { type: PAYKIT_SETUP_MESSAGE_TYPE, state },
        origin: PAYKIT_ORIGIN,
        source: window,
      });
    await act(async () => {
      window.dispatchEvent(event());
      window.dispatchEvent(event());
    });

    expect(mocks.markPaykitConnected).toHaveBeenCalledTimes(1);
  });

  it('ignores a callback that arrives after reset', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    const state = startFlow(result);
    attachIframeSource(result);
    act(() => {
      result.current.reset();
    });

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
  });

  it('errors when no Paykit Server is configured', () => {
    mocks.getPaykitSetupUrl.mockImplementation(() => {
      throw new Error('No Paykit Server configured');
    });
    const { result } = renderHook(() => usePaykitSetupFlow());
    startFlow(result);

    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
    expect(result.current.error).not.toBeNull();
  });

  it('reset returns to idle and drops the setup URL', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow());
    startFlow(result);

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    expect(result.current.setupUrl).toBeNull();
  });

  // The ready / setup_required / unavailable answers run through the real layers in
  // `DialogLocksAuth.integration.test.tsx`; these cover the answers the hook must not act on.
  describe('check', () => {
    /** A setup-status answer the test releases by hand. */
    const holdAnswer = () => {
      let release: (status: string) => void = () => {};
      mocks.fetchPaykitSetupStatus.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
      return (status: string) => release(status);
    };

    it('stops at unavailable without opening the setup when the check fails', async () => {
      mocks.fetchPaykitSetupStatus.mockRejectedValueOnce(new Error('Lock Server request failed with HTTP 502'));
      const { result } = renderHook(() => usePaykitSetupFlow());

      await act(async () => {
        await result.current.check();
      });

      expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
      expect(result.current.error).not.toBeNull();
      expect(result.current.setupUrl).toBeNull();
      expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
    });

    it('drops the failed setup URL while it checks again', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow());
      const state = startFlow(result);
      attachIframeSource(result);
      await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state, error: 'setup-failed' });
      expect(result.current.setupUrl).not.toBeNull();

      holdAnswer();
      act(() => void result.current.check());

      expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
      expect(result.current.setupUrl).toBeNull();
    });

    it('drops an answer that arrives after reset', async () => {
      const answer = holdAnswer();
      const { result } = renderHook(() => usePaykitSetupFlow());

      act(() => void result.current.check());
      act(() => result.current.reset());
      await act(async () => answer('ready'));

      expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    });

    it('checks again when the Locks session changed while it asked', async () => {
      const answer = holdAnswer();
      const { result } = renderHook(() => usePaykitSetupFlow());

      act(() => void result.current.check());
      expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
      useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });
      await act(async () => answer('ready'));

      expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    });
  });
});
