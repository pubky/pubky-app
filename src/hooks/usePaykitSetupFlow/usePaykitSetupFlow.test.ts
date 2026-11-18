import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IFRAME_MOUNT_TIMEOUT_MS, IFRAME_READY_AFTER_LOAD_MS } from '@/hooks/useIframeReady/useIframeReady';
import { ErrorCategory } from '@/libs/error/error.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { usePaykitSetupFlow } from './usePaykitSetupFlow';
import { PaykitSetupFlowStatus, type PaykitSetupMode } from './usePaykitSetupFlow.types';

const mocks = vi.hoisted(() => ({
  getPaykitSetupUrl: vi.fn(),
  getPaykitReconnectUrl: vi.fn(),
  fetchPaykitCreatorHeld: vi.fn(),
  markPaykitConnected: vi.fn(),
  fetchPaykitSetupStatus: vi.fn(),
  readBridge: vi.fn(),
}));

const PAYKIT_SETUP_MESSAGE_TYPE = 'paykit-setup-callback';
const PAYKIT_SETUP_READY_MESSAGE_TYPE = 'paykit-setup-ready';
const PAYKIT_ORIGIN = 'https://paykit.server';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getPaykitSetupUrl: mocks.getPaykitSetupUrl,
    getPaykitReconnectUrl: mocks.getPaykitReconnectUrl,
    fetchPaykitCreatorHeld: mocks.fetchPaykitCreatorHeld,
    markPaykitConnected: mocks.markPaykitConnected,
    fetchPaykitSetupStatus: mocks.fetchPaykitSetupStatus,
  },
}));

// The ready check stays real: it is the contract under test in the readiness block below.
vi.mock('./usePaykitSetupFlow.utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./usePaykitSetupFlow.utils')>()),
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

/** Opens an approval and returns the CSRF state captured by its URL builder. */
const startFlow = (result: { current: ReturnType<typeof usePaykitSetupFlow> }, mode: PaykitSetupMode = 'setup') => {
  act(() => {
    if (mode === 'reconnect') result.current.reconnect();
    else result.current.start();
  });
  const urlBuilder = mode === 'reconnect' ? mocks.getPaykitReconnectUrl : mocks.getPaykitSetupUrl;
  return urlBuilder.mock.calls[0][0].state as string;
};

describe('usePaykitSetupFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('ready');
    mocks.fetchPaykitCreatorHeld.mockResolvedValue(false);
    mocks.getPaykitReconnectUrl.mockReturnValue(
      `${PAYKIT_ORIGIN}/setup/reconnect?creator=pubkyCREATOR&return_to=https://app.example&state=STATE`,
    );
    useLocksAuthStore.setState({ ...locksAuthInitialState, locksSessionSecret: 'secret-abc' });
    mocks.getPaykitSetupUrl.mockReturnValue(`${PAYKIT_ORIGIN}/setup?return_to=https://app.example&state=STATE`);
    mocks.readBridge.mockImplementation((_event: MessageEvent, _source: MessageEventSource | null, _origin: string) => {
      const data = _event.data as Partial<{ type: string; state: string; error: string }>;
      // Like the real bridge: only the callback type counts, so a ready report is never a callback.
      if (data.type === PAYKIT_SETUP_READY_MESSAGE_TYPE) return null;
      return data.error ? { state: data.state, error: data.error } : { state: data.state };
    });
  });

  it('verifies denomination readiness after approval', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('USD'));
    const state = startFlow(result);
    attachIframeSource(result);
    expect(mocks.getPaykitSetupUrl).toHaveBeenCalledWith({ state });
    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });
    expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledWith('USD');
    expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
  });

  it('does not treat a callback as success when the server cannot confirm readiness', async () => {
    mocks.fetchPaykitSetupStatus.mockResolvedValue('unavailable');
    const { result } = renderHook(() => usePaykitSetupFlow('USD'));
    const state = startFlow(result);
    attachIframeSource(result);
    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });
    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
  });

  it('starts idle', () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    expect(result.current.setupUrl).toBeNull();
  });

  it('start exposes the setup URL and waits for approval', () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    startFlow(result);

    expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
    expect(result.current.setupUrl).toContain(`${PAYKIT_ORIGIN}/setup`);
  });

  it('records the connection on a matching success callback', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    const state = startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.markPaykitConnected).toHaveBeenCalledOnce();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
  });

  it('does not record a connection on a failure callback', async () => {
    mocks.fetchPaykitSetupStatus.mockResolvedValue('setup_required');
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    const state = startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state, error: 'setup-failed' });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.SETUP_INCOMPLETE);
  });

  it('fails when the callback state does not match the one it sent', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state' });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
  });

  it('fails when the Locks session changed while setup was open', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    const state = startFlow(result);
    attachIframeSource(result);
    useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
  });

  it('stays waiting when the bridge rejects the message', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    const state = startFlow(result);
    attachIframeSource(result);
    mocks.readBridge.mockReturnValueOnce(null);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state }, 'https://evil.example');

    expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
  });

  it('hands the bridge the iframe window and the Paykit origin to validate against', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    const state = startFlow(result);
    attachIframeSource(result);

    await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

    expect(mocks.readBridge).toHaveBeenCalledWith(expect.anything(), window, PAYKIT_ORIGIN);
  });

  // [3] The listener is one-shot: a replayed callback must not connect a second time.
  it('accepts only the first callback, ignoring a replay', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
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
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
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
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
    startFlow(result);

    expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
    expect(result.current.error).not.toBeNull();
  });

  it('reset returns to idle and drops the setup URL', async () => {
    const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
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
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

      await act(async () => {
        await result.current.check();
      });

      expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
      expect(result.current.error).not.toBeNull();
      expect(result.current.setupUrl).toBeNull();
      expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
    });

    it('drops the failed setup URL while it checks again', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result);
      attachIframeSource(result);
      await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state' });
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.setupUrl).not.toBeNull();

      holdAnswer();
      act(() => void result.current.check());

      expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
      expect(result.current.setupUrl).toBeNull();
    });

    it('drops an answer that arrives after reset', async () => {
      const answer = holdAnswer();
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

      act(() => void result.current.check());
      act(() => result.current.reset());
      await act(async () => answer('ready'));

      expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    });

    it('checks again when the Locks session changed while it asked', async () => {
      const answer = holdAnswer();
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

      act(() => void result.current.check());
      expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
      useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });
      await act(async () => answer('ready'));

      expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
    });
  });

  describe('waiting for the /setup page to render', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Each start() carries a fresh `state` in the URL, which keys the wait for the page.
      mocks.getPaykitSetupUrl.mockImplementation(({ state }: { state: string }) => {
        return `${PAYKIT_ORIGIN}/setup?return_to=https://app.example&state=${state}`;
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
    const fireLoad = (result: { current: ReturnType<typeof usePaykitSetupFlow> }) =>
      act(() => result.current.onSetupLoad());
    const postReady = (state: string, origin = PAYKIT_ORIGIN) =>
      postCallback({ type: PAYKIT_SETUP_READY_MESSAGE_TYPE, state }, origin);

    it('shows the page once it posts the ready report, and keeps waiting for approval', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      const state = startFlow(result);
      attachIframeSource(result);
      expect(result.current.isSetupReady).toBe(false);

      fireLoad(result);
      await postReady(state);
      expect(result.current.isSetupReady).toBe(true);

      await advance(IFRAME_MOUNT_TIMEOUT_MS + IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
      expect(result.current.error).toBeNull();
    });

    it('moves to ERROR when no ready report arrives within the limit after the load event', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await advance(IFRAME_READY_AFTER_LOAD_MS - 1);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);

      await advance(1);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.error?.category).toBe(ErrorCategory.Timeout);
      expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
    });

    it('moves to ERROR when the page never fires load', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result);
      attachIframeSource(result);

      await advance(IFRAME_MOUNT_TIMEOUT_MS - 1);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);

      await advance(1);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.error?.category).toBe(ErrorCategory.Timeout);
    });

    it('records the connection when the callback follows the ready report', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      const state = startFlow(result);
      attachIframeSource(result);
      fireLoad(result);
      await postReady(state);

      await advance(IFRAME_MOUNT_TIMEOUT_MS); // the creator takes a while to scan
      await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

      expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
      expect(mocks.markPaykitConnected).toHaveBeenCalledTimes(1);
    });

    it('does not count a ready report from another origin or for another state', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      const state = startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await postReady(state, 'https://evil.example');
      await postReady('OTHER-STATE');
      expect(result.current.isSetupReady).toBe(false);

      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
    });

    it('waits for a fresh ready report after Try again', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result);
      attachIframeSource(result);
      fireLoad(result);
      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);

      act(() => result.current.start());
      const retryState = mocks.getPaykitSetupUrl.mock.calls[1][0].state as string;
      expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
      expect(result.current.isSetupReady).toBe(false);

      // The new page gets its own limits: the old load does not carry over.
      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
      fireLoad(result);
      await postReady(retryState);
      expect(result.current.isSetupReady).toBe(true);
    });

    // A callback state mismatch goes to ERROR with `setupUrl` still set; the page wait must stop there,
    // or its timer would overwrite the validation error with a "did not render" timeout.
    it('stops the page wait once a mismatching callback moves the flow to ERROR', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state' });
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.setupUrl).not.toBeNull();

      await advance(IFRAME_MOUNT_TIMEOUT_MS + IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.error?.category).toBe(ErrorCategory.Validation);
    });

    it('accepts a callback that arrives before any ready report', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      const state = startFlow(result);
      attachIframeSource(result);
      fireLoad(result);

      await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });
      expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);

      await advance(IFRAME_MOUNT_TIMEOUT_MS + IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
      expect(result.current.error).toBeNull();
    });

    it('flags only a page-render timeout as a setup page failure', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result, 'reconnect');
      attachIframeSource(result);
      fireLoad(result);
      expect(result.current.isSetupPageFailed).toBe(false);

      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.isSetupPageFailed).toBe(true);

      // Another approval clears it, and a callback failure never sets it.
      act(() => result.current.reconnect());
      expect(result.current.isSetupPageFailed).toBe(false);
      await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state' });
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.isSetupPageFailed).toBe(false);
    });

    it('applies the same wait to the /setup/reconnect page', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      const state = startFlow(result, 'reconnect');
      attachIframeSource(result);
      fireLoad(result);
      expect(result.current.isSetupReady).toBe(false);

      await postReady(state);
      expect(result.current.isSetupReady).toBe(true);
    });

    it('moves a /setup/reconnect page that never reports ready to ERROR', async () => {
      const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
      startFlow(result, 'reconnect');
      attachIframeSource(result);
      fireLoad(result);

      await advance(IFRAME_READY_AFTER_LOAD_MS);
      expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      expect(result.current.mode).toBe('reconnect');
    });
  });

  describe('reconnect for a creator Paykit already holds', () => {
    const holdProbe = () => {
      let release: (held: boolean) => void = () => {};
      mocks.fetchPaykitCreatorHeld.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
      return (held: boolean) => release(held);
    };

    describe('before the setup opens', () => {
      beforeEach(() => {
        mocks.fetchPaykitSetupStatus.mockResolvedValue('setup_required');
      });

      it('opens the setup when Paykit does not hold the creator', async () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => {
          await result.current.check();
        });

        expect(mocks.fetchPaykitCreatorHeld).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
        expect(result.current.mode).toBe('setup');
        expect(mocks.getPaykitSetupUrl).toHaveBeenCalledTimes(1);
        expect(mocks.getPaykitReconnectUrl).not.toHaveBeenCalled();
      });

      it('stops at reconnect-required, opening neither page, when Paykit holds the creator', async () => {
        mocks.fetchPaykitCreatorHeld.mockResolvedValue(true);
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => {
          await result.current.check();
        });

        expect(result.current.status).toBe(PaykitSetupFlowStatus.RECONNECT_REQUIRED);
        expect(result.current.setupUrl).toBeNull();
        expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
        expect(mocks.getPaykitReconnectUrl).not.toHaveBeenCalled();
      });

      it('reports unavailable without opening either page when Paykit cannot say', async () => {
        mocks.fetchPaykitCreatorHeld.mockRejectedValue(new Error('probe failed'));
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => {
          await result.current.check();
        });

        expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
        expect(result.current.error).not.toBeNull();
        expect(result.current.setupUrl).toBeNull();
        expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
        expect(mocks.getPaykitReconnectUrl).not.toHaveBeenCalled();
      });

      it('keeps the checking state while Paykit is asked', async () => {
        const answer = holdProbe();
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => void result.current.check());
        expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
        await act(async () => answer(true));

        expect(result.current.status).toBe(PaykitSetupFlowStatus.RECONNECT_REQUIRED);
      });

      it('drops a probe answer that arrives after reset', async () => {
        const answer = holdProbe();
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => void result.current.check());
        act(() => result.current.reset());
        await act(async () => answer(true));

        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
        expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
      });

      it('drops a probe answer that arrives after the Locks session changed', async () => {
        const answer = holdProbe();
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => void result.current.check());
        useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });
        await act(async () => answer(false));

        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
        expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
      });
    });

    describe.each(['setup', 'reconnect'] as const)('after %s fails', (mode) => {
      const failSetup = async (result: { current: ReturnType<typeof usePaykitSetupFlow> }) => {
        const state = startFlow(result, mode);
        attachIframeSource(result);
        await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state, error: 'setup-failed' });
      };

      beforeEach(() => {
        mocks.fetchPaykitSetupStatus.mockResolvedValue('setup_required');
      });

      it('finishes without another approval when the flow committed despite the failure callback', async () => {
        mocks.fetchPaykitSetupStatus.mockResolvedValue('ready');
        mocks.fetchPaykitCreatorHeld.mockResolvedValue(true);
        const { result } = renderHook(() => usePaykitSetupFlow('USD'));

        await failSetup(result);

        expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledWith('USD');
        expect(mocks.fetchPaykitCreatorHeld).not.toHaveBeenCalled();
        expect(mocks.markPaykitConnected).toHaveBeenCalledOnce();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
        expect(result.current.setupUrl).toBeNull();
        expect(mocks.getPaykitReconnectUrl).toHaveBeenCalledTimes(mode === 'reconnect' ? 1 : 0);
        expect(mocks.getPaykitSetupUrl).toHaveBeenCalledTimes(mode === 'setup' ? 1 : 0);
      });

      it('reports unavailable without another approval when readiness is unavailable', async () => {
        mocks.fetchPaykitSetupStatus.mockResolvedValue('unavailable');
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);

        expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
        expect(result.current.setupUrl).toBeNull();
        expect(mocks.fetchPaykitCreatorHeld).not.toHaveBeenCalled();
        expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      });

      it('reports unavailable, without asking Paykit, when the Lock Server cannot say', async () => {
        mocks.fetchPaykitSetupStatus.mockRejectedValue(new Error('Lock Server request failed with HTTP 502'));
        mocks.fetchPaykitCreatorHeld.mockResolvedValue(true);
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);

        expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
        expect(result.current.error).not.toBeNull();
        expect(mocks.fetchPaykitCreatorHeld).not.toHaveBeenCalled();
        expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      });

      it('drops a readiness answer that arrives after the Locks session changed', async () => {
        let release: (status: string) => void = () => {};
        mocks.fetchPaykitSetupStatus.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);
        expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
        useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });
        await act(async () => release('ready'));

        expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
      });

      it('drops a readiness answer that arrives after reset', async () => {
        const answer = Promise.withResolvers<string>();
        mocks.fetchPaykitSetupStatus.mockReturnValueOnce(answer.promise);
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);
        expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
        act(() => result.current.reset());
        await act(async () => answer.resolve('ready'));

        expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
        expect(result.current.setupUrl).toBeNull();
      });

      it('keeps a newer ready result when an earlier failure diagnosis resolves', async () => {
        const answer = Promise.withResolvers<string>();
        mocks.fetchPaykitSetupStatus.mockReturnValueOnce(answer.promise).mockResolvedValueOnce('ready');
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);
        expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
        await act(async () => result.current.check());
        await act(async () => answer.resolve('setup_required'));

        expect(mocks.markPaykitConnected).toHaveBeenCalledOnce();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
        expect(mocks.fetchPaykitCreatorHeld).not.toHaveBeenCalled();
      });

      it('asks for a reconnect when Paykit holds the creator, without surfacing a setup error', async () => {
        mocks.fetchPaykitCreatorHeld.mockResolvedValue(true);
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);

        expect(result.current.status).toBe(PaykitSetupFlowStatus.RECONNECT_REQUIRED);
        expect(result.current.error).toBeNull();
        expect(result.current.setupUrl).toBeNull();
        expect(mocks.getPaykitReconnectUrl).toHaveBeenCalledTimes(mode === 'reconnect' ? 1 : 0);
      });

      it('reports an incomplete setup when Paykit does not hold the creator', async () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);

        expect(result.current.status).toBe(PaykitSetupFlowStatus.SETUP_INCOMPLETE);
        expect(result.current.error).toBeNull();
      });

      it('reports unavailable, with the cause, when Paykit cannot say', async () => {
        mocks.fetchPaykitCreatorHeld.mockRejectedValue(new Error('probe failed'));
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);

        expect(result.current.status).toBe(PaykitSetupFlowStatus.UNAVAILABLE);
        expect(result.current.error).not.toBeNull();
      });

      it('drops the diagnosis when the Locks session changed meanwhile', async () => {
        const answer = holdProbe();
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);
        expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
        useLocksAuthStore.setState({ locksSessionSecret: 'secret-other' });
        await act(async () => answer(true));

        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
      });

      it('drops a presence answer that arrives after reset', async () => {
        const answer = holdProbe();
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);
        expect(result.current.status).toBe(PaykitSetupFlowStatus.CHECKING);
        act(() => result.current.reset());
        await act(async () => answer(true));

        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
        expect(mocks.markPaykitConnected).not.toHaveBeenCalled();
      });

      it('ignores a failure callback whose state does not match', async () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
        startFlow(result, mode);
        attachIframeSource(result);

        await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state', error: 'setup-failed' });

        expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
        expect(mocks.fetchPaykitCreatorHeld).not.toHaveBeenCalled();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
      });
    });

    describe('reconnect()', () => {
      const startReconnect = (result: { current: ReturnType<typeof usePaykitSetupFlow> }) => {
        act(() => {
          result.current.reconnect();
        });
        return mocks.getPaykitReconnectUrl.mock.calls[0][0].state as string;
      };

      it('opens the reconnect page, not the setup, and waits for approval', () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
        const state = startReconnect(result);

        expect(mocks.getPaykitReconnectUrl).toHaveBeenCalledWith({ state });
        expect(mocks.getPaykitSetupUrl).not.toHaveBeenCalled();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
        expect(result.current.mode).toBe('reconnect');
        expect(result.current.setupUrl).toContain(`${PAYKIT_ORIGIN}/setup/reconnect`);
      });

      it('verifies readiness with the Lock Server after the reconnect is approved', async () => {
        const { result } = renderHook(() => usePaykitSetupFlow('USD'));
        const state = startReconnect(result);
        attachIframeSource(result);

        await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state });

        expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledWith('USD');
        expect(mocks.markPaykitConnected).toHaveBeenCalledOnce();
        expect(result.current.status).toBe(PaykitSetupFlowStatus.SUCCESS);
      });

      it('errors when the signed-in creator is unknown', () => {
        mocks.getPaykitReconnectUrl.mockImplementation(() => {
          throw new Error('No Locks creator to look up Paykit for');
        });
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        act(() => {
          result.current.reconnect();
        });

        expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
        expect(result.current.mode).toBe('reconnect');
        expect(result.current.setupUrl).toBeNull();
      });

      it('goes back to the setup mode on reset', () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
        startReconnect(result);

        act(() => result.current.reset());

        expect(result.current.mode).toBe('setup');
        expect(result.current.status).toBe(PaykitSetupFlowStatus.IDLE);
      });
    });
  });
});
