import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useLocksSettingsStatus } from './useLocksSettingsStatus';

const mocks = vi.hoisted(() => ({
  fetchPaykitSetupStatus: vi.fn(),
  fetchCreatorAuthorized: vi.fn(),
  needsSessionUpgrade: false,
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchPaykitSetupStatus: mocks.fetchPaykitSetupStatus,
    fetchCreatorAuthorized: mocks.fetchCreatorAuthorized,
    markPaykitConnected: () => useLocksAuthStore.getState().setPaykitConnected(true),
  },
}));

vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({
  useSessionNeedsUpgrade: () => mocks.needsSessionUpgrade,
}));

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session' });

const signIn = (paykitConnected = false) =>
  useLocksAuthStore.setState({ session: fakeSession, locksSessionSecret: 'secret-abc', paykitConnected });

const showTab = (visibilityState: DocumentVisibilityState) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibilityState);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

describe('useLocksSettingsStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mocks.needsSessionUpgrade = false;
    mocks.fetchPaykitSetupStatus.mockResolvedValue('ready');
    mocks.fetchCreatorAuthorized.mockResolvedValue(true);
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: true });
  });

  it('is not set up once the Lock Server grant was revoked in Pubky Ring, even with Paykit ready', async () => {
    signIn(true);
    // The real controller clears the Locks session on `false`.
    mocks.fetchCreatorAuthorized.mockImplementation(async () => {
      useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: true });
      return false;
    });
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('not-set-up'));
    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('is not set up on a revoked grant even when the controller keeps the session', async () => {
    signIn();
    mocks.fetchCreatorAuthorized.mockResolvedValue(false);
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('not-set-up'));
    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('does not ask Paykit when the Locks session ended during the authority check', async () => {
    signIn();
    mocks.fetchCreatorAuthorized.mockImplementation(async () => {
      useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: true });
      return true;
    });
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('not-set-up'));
    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('does not ask Paykit when a setup dialog opened during the authority check', async () => {
    signIn();
    const authority = Promise.withResolvers<boolean>();
    mocks.fetchCreatorAuthorized.mockReturnValueOnce(authority.promise);
    const { rerender } = renderHook(({ paused }) => useLocksSettingsStatus({ paused }), {
      initialProps: { paused: false },
    });
    expect(mocks.fetchCreatorAuthorized).toHaveBeenCalledTimes(1);

    rerender({ paused: true });
    await act(async () => {
      authority.resolve(true);
    });

    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('is an error, never "not set up", when the Lock Server cannot check its grant', async () => {
    signIn();
    mocks.fetchCreatorAuthorized.mockRejectedValue(new Error('HTTP 503'));
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('is loading until the store has hydrated', () => {
    useLocksAuthStore.setState({ hasHydrated: false });
    const { result } = renderHook(() => useLocksSettingsStatus());

    expect(result.current.status).toBe('loading');
  });

  it('is loading while a persisted session is being restored', () => {
    useLocksAuthStore.setState({ locksSessionSecret: 'secret-abc', session: null });
    const { result } = renderHook(() => useLocksSettingsStatus());

    expect(result.current.status).toBe('loading');
    expect(mocks.fetchCreatorAuthorized).not.toHaveBeenCalled();
    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('is not set up without a Locks session, and asks nothing', () => {
    const { result } = renderHook(() => useLocksSettingsStatus());

    expect(result.current.status).toBe('not-set-up');
    expect(mocks.fetchCreatorAuthorized).not.toHaveBeenCalled();
    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('is not set up while the homeserver session cannot reach /priv', () => {
    signIn(true);
    mocks.needsSessionUpgrade = true;
    const { result } = renderHook(() => useLocksSettingsStatus());

    expect(result.current.status).toBe('not-set-up');
    expect(mocks.fetchCreatorAuthorized).not.toHaveBeenCalled();
    expect(mocks.fetchPaykitSetupStatus).not.toHaveBeenCalled();
  });

  it('is set up once the Lock Server says the Paykit setup is ready', async () => {
    signIn();
    const { result } = renderHook(() => useLocksSettingsStatus());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('set-up'));
    expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledWith('BTC');
  });

  it('is not set up when the Paykit setup is required', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('setup_required');
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('not-set-up'));
  });

  it('is unavailable, never "not set up", when the Lock Server answers unavailable', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('unavailable');
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('is an error, never "not set up", when the check fails', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useLocksSettingsStatus());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('shows set up at once when this session already knows Paykit is connected', () => {
    signIn(true);
    mocks.fetchPaykitSetupStatus.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLocksSettingsStatus());

    expect(result.current.status).toBe('set-up');
  });

  it('asks again on recheck, and shows loading instead of the old answer meanwhile', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('unavailable');
    const { result } = renderHook(() => useLocksSettingsStatus());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    mocks.fetchPaykitSetupStatus.mockResolvedValue('ready');
    act(() => result.current.recheck());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('set-up'));
    expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(2);
  });

  it('asks again quietly when the tab is shown again, keeping the last answer meanwhile', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('unavailable');
    const { result } = renderHook(() => useLocksSettingsStatus());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    showTab('hidden');
    expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(1);

    mocks.fetchPaykitSetupStatus.mockReturnValue(new Promise(() => {}));
    showTab('visible');

    await waitFor(() => expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('unavailable');
  });

  it('does not ask again when the tab is shown while paused, and does once resumed', async () => {
    signIn();
    const { rerender } = renderHook(({ paused }) => useLocksSettingsStatus({ paused }), {
      initialProps: { paused: true },
    });
    expect(mocks.fetchCreatorAuthorized).toHaveBeenCalledTimes(1);

    showTab('visible');
    expect(mocks.fetchCreatorAuthorized).toHaveBeenCalledTimes(1);

    rerender({ paused: false });
    showTab('visible');
    await waitFor(() => expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(1));
    expect(mocks.fetchCreatorAuthorized).toHaveBeenCalledTimes(2);
  });

  // A grant revoked in Pubky Ring after the page showed set up (#2984).
  it('shows a later unavailable answer even though this session saw Paykit connected', async () => {
    signIn();
    const { result } = renderHook(() => useLocksSettingsStatus());
    await waitFor(() => expect(result.current.status).toBe('set-up'));

    mocks.fetchPaykitSetupStatus.mockResolvedValue('unavailable');
    showTab('visible');

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('keeps set up when a check sent before the setup dialog finished answers later', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValueOnce('unavailable');
    const { result } = renderHook(() => useLocksSettingsStatus());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    const pendingCheck = Promise.withResolvers<string>();
    mocks.fetchPaykitSetupStatus.mockReturnValueOnce(pendingCheck.promise);
    showTab('visible');
    await waitFor(() => expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(2));

    act(() => {
      result.current.markSetUp();
    });
    expect(result.current.status).toBe('set-up');

    await act(async () => {
      pendingCheck.resolve('setup_required');
    });
    expect(result.current.status).toBe('set-up');
  });

  it('drops a check sent before a setup dialog opened, without marking Paykit connected', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValueOnce('unavailable');
    const { result, rerender } = renderHook(({ paused }) => useLocksSettingsStatus({ paused }), {
      initialProps: { paused: false },
    });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    const pendingCheck = Promise.withResolvers<string>();
    mocks.fetchPaykitSetupStatus.mockReturnValueOnce(pendingCheck.promise);
    showTab('visible');
    await waitFor(() => expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(2));
    rerender({ paused: true });
    await act(async () => {
      pendingCheck.resolve('ready');
    });

    expect(result.current.status).toBe('unavailable');
    expect(useLocksAuthStore.getState().paykitConnected).toBe(false);
  });

  it('shows set up when a setup dialog closes with Paykit connected, without onSuccess', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValueOnce('unavailable');
    const { result, rerender } = renderHook(({ paused }) => useLocksSettingsStatus({ paused }), {
      initialProps: { paused: false },
    });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    rerender({ paused: true });
    act(() => {
      useLocksAuthStore.getState().setPaykitConnected(true);
    });
    rerender({ paused: false });

    expect(result.current.status).toBe('set-up');
  });

  it('keeps the last answer when a setup dialog closes without connecting Paykit', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValueOnce('unavailable');
    const { result, rerender } = renderHook(({ paused }) => useLocksSettingsStatus({ paused }), {
      initialProps: { paused: false },
    });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    rerender({ paused: true });
    rerender({ paused: false });

    expect(result.current.status).toBe('unavailable');
  });

  it('shows set up after a finished setup dialog, even over an older answer', async () => {
    signIn();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('setup_required');
    const { result } = renderHook(() => useLocksSettingsStatus());
    await waitFor(() => expect(result.current.status).toBe('not-set-up'));

    act(() => {
      useLocksAuthStore.getState().setPaykitConnected(true);
      result.current.markSetUp();
    });

    expect(result.current.status).toBe('set-up');
    expect(mocks.fetchPaykitSetupStatus).toHaveBeenCalledTimes(1);
  });
});
