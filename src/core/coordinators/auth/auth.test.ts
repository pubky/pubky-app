import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import type { ActiveSessionFailure } from '@/libs/auth/session.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { mockSession } from '@/test-utils/pubky';
import { mockGrantReference } from '@/test-utils/pubky';
import { AuthCoordinator } from './auth';

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    restorePersistedSession: vi.fn().mockResolvedValue(false),
    retireLegacyCookieSessions: vi.fn().mockResolvedValue(undefined),
    retrySessionRetirement: vi.fn().mockResolvedValue(undefined),
    syncSessionFromStorage: vi.fn().mockResolvedValue(undefined),
    syncRemovedSession: vi.fn().mockResolvedValue(undefined),
    subscribeSessionFailures: vi.fn(() => vi.fn()),
    requireSessionReauthentication: vi.fn(() => true),
  },
}));
const coordinator = AuthCoordinator.getInstance();
beforeEach(() => {
  coordinator.stop();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  useAuthStore.setState({ ...authInitialState, hasHydrated: false });
});
afterEach(() => {
  coordinator.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AuthCoordinator', () => {
  it('shares only accepted failure generations, ignores malformed events and closes subscriptions', () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    const channels: { onmessage: ((event: MessageEvent<unknown>) => void) | null }[] = [];
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage = null;
        postMessage = postMessage;
        close = close;
        constructor() {
          channels.push(this);
        }
      },
    );
    coordinator.start();
    coordinator.start();
    expect(AuthController.subscribeSessionFailures).toHaveBeenCalledOnce();
    const listener = vi.mocked(AuthController.subscribeSessionFailures).mock.calls[0][0];
    const failure: ActiveSessionFailure = { session: mockSession(), generation: 'active' };
    listener(failure);
    expect(AuthController.requireSessionReauthentication).toHaveBeenCalledWith(failure);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ generation: 'active' });
    vi.mocked(AuthController.requireSessionReauthentication).mockReturnValueOnce(false);
    listener(failure);
    expect(postMessage).toHaveBeenCalledOnce();
    channels[0].onmessage!(new MessageEvent('message', { data: { generation: 'remote' } }));
    expect(AuthController.requireSessionReauthentication).toHaveBeenLastCalledWith({ generation: 'remote' });
    const count = vi.mocked(AuthController.requireSessionReauthentication).mock.calls.length;
    for (const data of [null, {}, { generation: 1 }]) channels[0].onmessage!(new MessageEvent('message', { data }));
    expect(AuthController.requireSessionReauthentication).toHaveBeenCalledTimes(count);
    coordinator.stop();
    expect(close).toHaveBeenCalledOnce();
    expect(vi.mocked(AuthController.subscribeSessionFailures).mock.results[0].value).toHaveBeenCalledOnce();
  });

  it('starts once, waits for hydration and stops all event subscriptions', async () => {
    coordinator.start();
    coordinator.start();
    expect(AuthController.retireLegacyCookieSessions).not.toHaveBeenCalled();
    useAuthStore.setState({ hasHydrated: true, sessionReference: mockGrantReference() });
    expect(AuthController.restorePersistedSession).toHaveBeenCalledOnce();
    expect(AuthController.retireLegacyCookieSessions).toHaveBeenCalledOnce();
    coordinator.stop();
    vi.clearAllMocks();
    useAuthStore.setState({ restoreStatus: 'temporary-error' });
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_PERSIST_KEY }));
    window.dispatchEvent(new CustomEvent('pubky-session-changed', { detail: { action: 'cleared', id: null } }));
    expect(AuthController.restorePersistedSession).not.toHaveBeenCalled();
    expect(AuthController.syncSessionFromStorage).not.toHaveBeenCalled();
    expect(AuthController.syncRemovedSession).not.toHaveBeenCalled();
    expect(AuthController.retrySessionRetirement).not.toHaveBeenCalled();
  });
  it('synchronizes auth storage changes and SDK removals only', () => {
    coordinator.start();
    for (const key of [AUTH_PERSIST_KEY, null, 'unrelated']) window.dispatchEvent(new StorageEvent('storage', { key }));
    for (const detail of [
      { action: 'removed', id: 'grant' },
      { action: 'cleared', id: null },
      { action: 'saved', id: 'grant' },
      null,
      { action: 'removed', id: 42 },
    ]) {
      window.dispatchEvent(new CustomEvent('pubky-session-changed', { detail }));
    }
    expect(AuthController.syncSessionFromStorage).toHaveBeenCalledTimes(2);
    expect(AuthController.syncRemovedSession).toHaveBeenCalledTimes(2);
    expect(AuthController.syncRemovedSession).toHaveBeenCalledWith('grant');
    expect(AuthController.syncRemovedSession).toHaveBeenCalledWith(null);
  });
  it('throttles foreground and online recovery after a failure without duplicating metadata cleanup', async () => {
    useAuthStore.setState({ hasHydrated: true, restoreStatus: 'temporary-error' });
    coordinator.start();
    vi.clearAllMocks();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(AuthController.restorePersistedSession).toHaveBeenCalledOnce();
    expect(AuthController.retrySessionRetirement).not.toHaveBeenCalled();
    expect(AuthController.retireLegacyCookieSessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(AuthController.restorePersistedSession).toHaveBeenCalledTimes(2);
  });
  it('retries immediately when the network returns during the focus cooldown', () => {
    useAuthStore.setState({ hasHydrated: true, restoreStatus: 'temporary-error' });
    coordinator.start();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(AuthController.restorePersistedSession).toHaveBeenCalledTimes(2);
  });
  it.each(['hidden', 'logout', 'unhydrated'])('does not automatically recover while %s', (condition) => {
    useAuthStore.setState({
      hasHydrated: condition !== 'unhydrated',
      restoreStatus: 'temporary-error',
      isLoggingOut: condition === 'logout',
    });
    if (condition === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    coordinator.start();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(AuthController.restorePersistedSession).not.toHaveBeenCalled();
  });
  it('delivers an asynchronous restore error to its current handler', async () => {
    const failure = new Error('wrong environment');
    vi.mocked(AuthController.restorePersistedSession).mockRejectedValueOnce(failure);
    const handler = vi.fn();
    useAuthStore.setState({ hasHydrated: true, sessionReference: mockGrantReference() });
    coordinator.start(handler);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith(failure);
  });
});
