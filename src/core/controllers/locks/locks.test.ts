import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksController } from './locks';

const mocks = vi.hoisted(() => ({
  generateConnectUrl: vi.fn(),
  isServerReady: vi.fn(),
  exchangeSessionCode: vi.fn(),
  restoreSession: vi.fn(),
  signout: vi.fn(),
  setLockServiceConfig: vi.fn(),
  createLockContent: vi.fn(),
}));

vi.mock('@/application/locks/locks', () => ({
  LocksApplication: {
    generateConnectUrl: mocks.generateConnectUrl,
    isServerReady: mocks.isServerReady,
    exchangeSessionCode: mocks.exchangeSessionCode,
    restoreSession: mocks.restoreSession,
    signout: mocks.signout,
    setLockServiceConfig: mocks.setLockServiceConfig,
    createLockContent: mocks.createLockContent,
  },
}));

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session' });

describe('LocksController (auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateConnectUrl.mockResolvedValue('https://lock.server/connect');
    mocks.isServerReady.mockResolvedValue(true);
    mocks.exchangeSessionCode.mockResolvedValue({ session: fakeSession, secret: 'secret-abc' });
    mocks.signout.mockResolvedValue(undefined);
    mocks.setLockServiceConfig.mockResolvedValue(undefined);
    useLocksAuthStore.setState(locksAuthInitialState);
  });

  it('getConnectUrl derives returnTo from the app origin and forwards it', async () => {
    const url = await LocksController.getConnectUrl({ state: 'opaque-state' });

    expect(url).toBe('https://lock.server/connect');
    expect(mocks.generateConnectUrl).toHaveBeenCalledWith({
      returnTo: window.location.origin,
      state: 'opaque-state',
    });
  });

  it('isServerReachable probes readiness at the origin resolved from a throwaway connect URL', async () => {
    await expect(LocksController.isServerReachable()).resolves.toBe(true);
    expect(mocks.isServerReady).toHaveBeenCalledWith('https://lock.server');
  });

  it('isServerReachable returns false when the server is not ready', async () => {
    mocks.isServerReady.mockResolvedValue(false);
    await expect(LocksController.isServerReachable()).resolves.toBe(false);
  });

  it('completeAuthFromCallback exchanges the code and persists the session to the store', async () => {
    const result = await LocksController.completeAuthFromCallback({ code: 'CODE', state: 'STATE' });

    expect(result.session).toBe(fakeSession);
    expect(mocks.exchangeSessionCode).toHaveBeenCalledWith({ code: 'CODE', state: 'STATE' });
    const store = useLocksAuthStore.getState();
    expect(store.selectIsLocksAuthenticated()).toBe(true);
    expect(store.selectLocksSession()).toBe(fakeSession);
    expect(store.selectLocksSessionSecret()).toBe('secret-abc');
  });

  it('completeAuthFromCallback registers the lock-service config in the background after the session is stored', async () => {
    // The service reads the session from the store, so the store must be populated by call time.
    mocks.setLockServiceConfig.mockImplementation(async () => {
      expect(useLocksAuthStore.getState().selectLocksSession()).toBe(fakeSession);
    });

    await LocksController.completeAuthFromCallback({ code: 'CODE', state: 'STATE' });
    // Background write is fire-and-forget; let the microtask queue flush.
    await Promise.resolve();

    expect(mocks.setLockServiceConfig).toHaveBeenCalledTimes(1);
  });

  it('completeAuthFromCallback keeps the session when the background config write fails', async () => {
    mocks.setLockServiceConfig.mockRejectedValue(new Error('config write failed'));

    const result = await LocksController.completeAuthFromCallback({ code: 'CODE', state: 'STATE' });
    await Promise.resolve();

    expect(result.session).toBe(fakeSession);
    expect(mocks.setLockServiceConfig).toHaveBeenCalledTimes(1);
    expect(useLocksAuthStore.getState().selectIsLocksAuthenticated()).toBe(true);
  });

  describe('logout', () => {
    it('signs out the live session on the Lock Server and clears the store', async () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });

      await LocksController.logout();

      expect(mocks.signout).toHaveBeenCalledTimes(1);
      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });

    it('clears the store even when the Lock Server signout fails', async () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      mocks.signout.mockRejectedValue(new Error('network down'));

      await LocksController.logout();

      expect(mocks.signout).toHaveBeenCalledTimes(1);
      expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
    });

    // A server that connects but never answers must not hold the device in a half-logged-out state.
    it('clears the store without waiting for a signout that never answers', async () => {
      vi.useFakeTimers();
      try {
        useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
        mocks.signout.mockReturnValue(new Promise(() => {})); // never settles

        const done = LocksController.logout();
        await vi.advanceTimersByTimeAsync(60_000); // well past the signout timeout
        await done;

        expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears the persisted secret without a network call when no live session exists', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });

      await LocksController.logout();

      expect(mocks.signout).not.toHaveBeenCalled();
      expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
    });
  });

  it('does not persist a session when the callback exchange fails', async () => {
    mocks.exchangeSessionCode.mockRejectedValueOnce(new Error('exchange failed'));

    await expect(LocksController.completeAuthFromCallback({ code: 'CODE', state: 'STATE' })).rejects.toThrow(
      'exchange failed',
    );

    const store = useLocksAuthStore.getState();
    expect(store.selectIsLocksAuthenticated()).toBe(false);
    expect(store.selectLocksSession()).toBeNull();
    expect(store.selectLocksSessionSecret()).toBeNull();
  });

  describe('restorePersistedLocksSession', () => {
    it('rebuilds and sets the live session from a persisted secret', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
      mocks.restoreSession.mockReturnValue(fakeSession);

      await LocksController.restorePersistedLocksSession();

      expect(mocks.restoreSession).toHaveBeenCalledTimes(1);
      expect(useLocksAuthStore.getState().selectLocksSession()).toBe(fakeSession);
    });

    it('no-ops when there is no persisted secret', () => {
      LocksController.restorePersistedLocksSession();
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('no-ops when a live session already exists', () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      LocksController.restorePersistedLocksSession();
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('clears the store when restore throws (malformed/stale secret)', () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'bad-secret' });
      mocks.restoreSession.mockImplementation(() => {
        throw new Error('invalid secret');
      });

      LocksController.restorePersistedLocksSession();

      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });
  });
});

describe('LocksController (content)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createLockContent delegates to the application workflow', async () => {
    const lock = { lock_id: 'LOCK1', content_lock_path: '/pub/locks.app/LOCK1.json', creator: 'pubkybob' };
    mocks.createLockContent.mockResolvedValue(lock);
    const params = { attachments: [], buildPost: () => ({ contentType: 'application/json', bytes: new Uint8Array() }) };

    await expect(LocksController.createLockContent(params)).resolves.toBe(lock);
    expect(mocks.createLockContent).toHaveBeenCalledWith(params);
  });
});
