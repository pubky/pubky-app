import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { usePaykitSetupFlow } from './usePaykitSetupFlow';
import { PaykitSetupFlowStatus } from './usePaykitSetupFlow.types';

const mocks = vi.hoisted(() => ({
  getPaykitSetupUrl: vi.fn(),
  getPaykitReconnectUrl: vi.fn(),
  fetchPaykitCreatorHeld: vi.fn(),
  markPaykitConnected: vi.fn(),
  fetchPaykitSetupStatus: vi.fn(),
  readBridge: vi.fn(),
}));

const PAYKIT_SETUP_MESSAGE_TYPE = 'paykit-setup-callback';
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
    mocks.fetchPaykitSetupStatus.mockResolvedValue('ready');
    mocks.fetchPaykitCreatorHeld.mockResolvedValue(false);
    mocks.getPaykitReconnectUrl.mockReturnValue(
      `${PAYKIT_ORIGIN}/setup/reconnect?creator=pubkyCREATOR&return_to=https://app.example&state=STATE`,
    );
    useLocksAuthStore.setState({ ...locksAuthInitialState, locksSessionSecret: 'secret-abc' });
    mocks.getPaykitSetupUrl.mockReturnValue(`${PAYKIT_ORIGIN}/setup?return_to=https://app.example&state=STATE`);
    mocks.readBridge.mockImplementation((_event: MessageEvent, _source: MessageEventSource | null, _origin: string) => {
      const data = _event.data as Partial<{ state: string; error: string }>;
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

      it('opens the setup as before when Paykit cannot say', async () => {
        mocks.fetchPaykitCreatorHeld.mockRejectedValue(new Error('probe failed'));
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await act(async () => {
          await result.current.check();
        });

        expect(result.current.status).toBe(PaykitSetupFlowStatus.AWAITING_APPROVAL);
        expect(mocks.getPaykitSetupUrl).toHaveBeenCalledTimes(1);
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

    describe('after the setup fails', () => {
      const failSetup = async (result: { current: ReturnType<typeof usePaykitSetupFlow> }) => {
        const state = startFlow(result);
        attachIframeSource(result);
        await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state, error: 'setup-failed' });
      };

      it('asks for a reconnect when Paykit holds the creator, without surfacing a setup error', async () => {
        mocks.fetchPaykitCreatorHeld.mockResolvedValue(true);
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));

        await failSetup(result);

        expect(result.current.status).toBe(PaykitSetupFlowStatus.RECONNECT_REQUIRED);
        expect(result.current.error).toBeNull();
        expect(result.current.setupUrl).toBeNull();
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

      it('ignores a failure callback whose state does not match', async () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
        startFlow(result);
        attachIframeSource(result);

        await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'other-state', error: 'setup-failed' });

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

      it('ends in an error, without asking Paykit again, when the reconnect fails', async () => {
        const { result } = renderHook(() => usePaykitSetupFlow('BTC'));
        const state = startReconnect(result);
        attachIframeSource(result);

        await postCallback({ type: PAYKIT_SETUP_MESSAGE_TYPE, state, error: 'setup-failed' });

        expect(result.current.status).toBe(PaykitSetupFlowStatus.ERROR);
        expect(result.current.mode).toBe('reconnect');
        expect(result.current.error?.message).toContain('Paykit reconnect failed');
        expect(mocks.fetchPaykitCreatorHeld).not.toHaveBeenCalled();
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
