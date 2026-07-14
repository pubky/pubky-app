import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksAuthController } from './locksAuth';

const mocks = vi.hoisted(() => ({
  generateConnectUrl: vi.fn(),
  exchangeSessionCode: vi.fn(),
  restoreSession: vi.fn(),
  signout: vi.fn(),
  setLockServiceConfig: vi.fn(),
}));

vi.mock('@/application/locksAuth/locksAuth', () => ({
  LocksAuthApplication: {
    generateConnectUrl: mocks.generateConnectUrl,
    exchangeSessionCode: mocks.exchangeSessionCode,
    restoreSession: mocks.restoreSession,
    signout: mocks.signout,
    setLockServiceConfig: mocks.setLockServiceConfig,
  },
}));

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session' });

describe('LocksAuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateConnectUrl.mockResolvedValue('https://lock.server/connect');
    mocks.exchangeSessionCode.mockResolvedValue({ session: fakeSession, secret: 'secret-abc' });
    mocks.signout.mockResolvedValue(undefined);
    mocks.setLockServiceConfig.mockResolvedValue(undefined);
    useLocksAuthStore.setState(locksAuthInitialState);
  });

  it('getConnectUrl derives returnTo from the app origin and forwards it', async () => {
    const url = await LocksAuthController.getConnectUrl({ lockServerPubky: 'lockpubky', state: 'opaque-state' });

    expect(url).toBe('https://lock.server/connect');
    expect(mocks.generateConnectUrl).toHaveBeenCalledWith({
      lockServerPubky: 'lockpubky',
      returnTo: window.location.origin,
      state: 'opaque-state',
    });
  });

  it('completeAuthFromCallback exchanges the code and persists the session to the store', async () => {
    const result = await LocksAuthController.completeAuthFromCallback({
      lockServerPubky: 'lockpubky',
      code: 'CODE',
      state: 'STATE',
    });

    expect(result.session).toBe(fakeSession);
    expect(mocks.exchangeSessionCode).toHaveBeenCalledWith({
      lockServerPubky: 'lockpubky',
      code: 'CODE',
      state: 'STATE',
    });
    const store = useLocksAuthStore.getState();
    expect(store.selectIsLocksAuthenticated()).toBe(true);
    expect(store.selectLocksSession()).toBe(fakeSession);
    expect(store.selectLocksSessionSecret()).toBe('secret-abc');
  });

  it('completeAuthFromCallback registers the lock-service config in the background with the authed server', async () => {
    await LocksAuthController.completeAuthFromCallback({ lockServerPubky: 'lockpubky', code: 'CODE', state: 'STATE' });
    // Background write is fire-and-forget; let the microtask queue flush.
    await Promise.resolve();

    expect(mocks.setLockServiceConfig).toHaveBeenCalledWith(fakeSession, 'lockpubky');
  });

  it('completeAuthFromCallback keeps the session when the background config write fails', async () => {
    mocks.setLockServiceConfig.mockRejectedValue(new Error('config write failed'));

    const result = await LocksAuthController.completeAuthFromCallback({
      lockServerPubky: 'lockpubky',
      code: 'CODE',
      state: 'STATE',
    });
    await Promise.resolve();

    expect(result.session).toBe(fakeSession);
    expect(mocks.setLockServiceConfig).toHaveBeenCalledWith(fakeSession, 'lockpubky');
    expect(useLocksAuthStore.getState().selectIsLocksAuthenticated()).toBe(true);
  });

  describe('logout', () => {
    it('signs out the live session on the Lock Server and clears the store', async () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });

      await LocksAuthController.logout();

      expect(mocks.signout).toHaveBeenCalledWith(fakeSession);
      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });

    it('clears the store even when the Lock Server signout fails', async () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      mocks.signout.mockRejectedValue(new Error('network down'));

      await LocksAuthController.logout();

      expect(mocks.signout).toHaveBeenCalledWith(fakeSession);
      expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
    });

    it('clears the persisted secret without a network call when no live session exists', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });

      await LocksAuthController.logout();

      expect(mocks.signout).not.toHaveBeenCalled();
      expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
    });
  });

  it('does not persist a session when the callback exchange fails', async () => {
    mocks.exchangeSessionCode.mockRejectedValueOnce(new Error('exchange failed'));

    await expect(
      LocksAuthController.completeAuthFromCallback({
        lockServerPubky: 'lockpubky',
        code: 'CODE',
        state: 'STATE',
      }),
    ).rejects.toThrow('exchange failed');

    const store = useLocksAuthStore.getState();
    expect(store.selectIsLocksAuthenticated()).toBe(false);
    expect(store.selectLocksSession()).toBeNull();
    expect(store.selectLocksSessionSecret()).toBeNull();
  });

  describe('restorePersistedLocksSession', () => {
    it('rebuilds and sets the live session from a persisted secret', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
      mocks.restoreSession.mockReturnValue(fakeSession);

      await LocksAuthController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });

      expect(mocks.restoreSession).toHaveBeenCalledWith({ lockServerPubky: 'lockpubky', secret: 'secret-abc' });
      expect(useLocksAuthStore.getState().selectLocksSession()).toBe(fakeSession);
    });

    it('no-ops when there is no persisted secret', () => {
      LocksAuthController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('no-ops when a live session already exists', () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      LocksAuthController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('clears the store when restore throws (malformed/stale secret)', () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'bad-secret' });
      mocks.restoreSession.mockImplementation(() => {
        throw new Error('invalid secret');
      });

      LocksAuthController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });

      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });
  });
});
