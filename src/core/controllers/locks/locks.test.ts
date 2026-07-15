import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppError } from '@/libs/error/error.utils';
import type { TGuardedResource } from '@/services/locks/locks.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksController } from './locks';

const mocks = vi.hoisted(() => ({
  generateConnectUrl: vi.fn(),
  exchangeSessionCode: vi.fn(),
  restoreSession: vi.fn(),
  signout: vi.fn(),
  setLockServiceConfig: vi.fn(),
  registerGuardedResource: vi.fn(),
  createContentLock: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock('@/application/locks/locks', () => ({
  LocksApplication: {
    generateConnectUrl: mocks.generateConnectUrl,
    exchangeSessionCode: mocks.exchangeSessionCode,
    restoreSession: mocks.restoreSession,
    signout: mocks.signout,
    setLockServiceConfig: mocks.setLockServiceConfig,
    registerGuardedResource: mocks.registerGuardedResource,
    createContentLock: mocks.createContentLock,
  },
}));

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session', lockServer: () => 'lockpubky' });

describe('LocksController (auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateConnectUrl.mockResolvedValue('https://lock.server/connect');
    mocks.exchangeSessionCode.mockResolvedValue({ session: fakeSession, secret: 'secret-abc' });
    mocks.signout.mockResolvedValue(undefined);
    mocks.setLockServiceConfig.mockResolvedValue(undefined);
    useLocksAuthStore.setState(locksAuthInitialState);
  });

  it('getConnectUrl derives returnTo from the app origin and forwards it', async () => {
    const url = await LocksController.getConnectUrl({ lockServerPubky: 'lockpubky', state: 'opaque-state' });

    expect(url).toBe('https://lock.server/connect');
    expect(mocks.generateConnectUrl).toHaveBeenCalledWith({
      lockServerPubky: 'lockpubky',
      returnTo: window.location.origin,
      state: 'opaque-state',
    });
  });

  it('completeAuthFromCallback exchanges the code and persists the session to the store', async () => {
    const result = await LocksController.completeAuthFromCallback({
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
    await LocksController.completeAuthFromCallback({ lockServerPubky: 'lockpubky', code: 'CODE', state: 'STATE' });
    // Background write is fire-and-forget; let the microtask queue flush.
    await Promise.resolve();

    expect(mocks.setLockServiceConfig).toHaveBeenCalledWith(fakeSession, 'lockpubky');
  });

  it('completeAuthFromCallback keeps the session when the background config write fails', async () => {
    mocks.setLockServiceConfig.mockRejectedValue(new Error('config write failed'));

    const result = await LocksController.completeAuthFromCallback({
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

      await LocksController.logout();

      expect(mocks.signout).toHaveBeenCalledWith(fakeSession);
      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });

    it('clears the store even when the Lock Server signout fails', async () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      mocks.signout.mockRejectedValue(new Error('network down'));

      await LocksController.logout();

      expect(mocks.signout).toHaveBeenCalledWith(fakeSession);
      expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
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

    await expect(
      LocksController.completeAuthFromCallback({
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

      await LocksController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });

      expect(mocks.restoreSession).toHaveBeenCalledWith({ lockServerPubky: 'lockpubky', secret: 'secret-abc' });
      expect(useLocksAuthStore.getState().selectLocksSession()).toBe(fakeSession);
    });

    it('no-ops when there is no persisted secret', () => {
      LocksController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('no-ops when a live session already exists', () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      LocksController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('clears the store when restore throws (malformed/stale secret)', () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'bad-secret' });
      mocks.restoreSession.mockImplementation(() => {
        throw new Error('invalid secret');
      });

      LocksController.restorePersistedLocksSession({ lockServerPubky: 'lockpubky' });

      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });
  });
});

const file = (contentType = 'application/json') => ({ contentType, bytes: new Uint8Array([1]) });
const descriptor = (path: string) => ({ path, hash: 'HASH', content_type: 'application/json', size: 1 });
/** Default builder: ignores the attachment paths and returns a fixed post JSON. */
const buildPost = () => file();

describe('LocksController (content)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let minted = 0;
    mocks.randomUUID.mockImplementation(() => `id-${++minted}`);
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: mocks.randomUUID });
    mocks.registerGuardedResource.mockImplementation(({ path }: { path: string }) => ({
      resource: descriptor(path),
      creator: 'pubkybob',
    }));
    mocks.createContentLock.mockResolvedValue({
      lock_id: 'LOCK1',
      content_lock_path: '/pub/locks.app/LOCK1.json',
      creator: 'pubkybob',
    });
    useLocksAuthStore.setState(locksAuthInitialState);
    useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
  });

  it('uploads the attachments first, then the post built from their paths', async () => {
    const seen: TGuardedResource[][] = [];
    let seenOwner: string | undefined;
    const result = await LocksController.createLockContent({
      attachments: [file('image/png'), file('video/mp4')],
      buildPost: (attachmentResources, ownerPubky) => {
        seen.push(attachmentResources);
        seenOwner = ownerPubky;
        return file();
      },
    });

    // Attachments upload first (id-1, id-2); the post is uploaded last (id-3).
    expect(mocks.registerGuardedResource.mock.calls.map(([params]) => params.path)).toEqual(['id-1', 'id-2', 'id-3']);
    // The builder sees the attachment descriptors, so the post can reference their paths.
    expect(seen).toEqual([[descriptor('id-1'), descriptor('id-2')]]);
    // ...and the owner the bytes landed on, so those references point at the right account.
    expect(seenOwner).toBe('pubkybob');

    expect(mocks.createContentLock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: fakeSession,
        primaryResource: descriptor('id-3'),
        secondaryResources: [descriptor('id-1'), descriptor('id-2')],
        lockServer: { override: 'lockpubky' },
      }),
    );
    expect(result).toEqual({ lock_id: 'LOCK1', content_lock_path: '/pub/locks.app/LOCK1.json', creator: 'pubkybob' });
  });

  it('gives identical files distinct paths, so neither overwrites the other', async () => {
    await LocksController.createLockContent({
      attachments: [file('image/png'), file('image/png')],
      buildPost,
    });

    const paths = mocks.registerGuardedResource.mock.calls.map(([params]) => params.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('builds the post with an empty list when there are no attachments', async () => {
    const builder = vi.fn(() => file());

    await LocksController.createLockContent({ buildPost: builder });

    expect(builder).toHaveBeenCalledWith([], undefined);
    expect(mocks.registerGuardedResource).toHaveBeenCalledTimes(1);
    expect(mocks.createContentLock).toHaveBeenCalledWith(expect.objectContaining({ secondaryResources: [] }));
  });

  it('sends the placeholder dev-static criterion and lock logic', async () => {
    await LocksController.createLockContent({ buildPost });

    const [params] = mocks.createContentLock.mock.calls[0];
    expect(params.criteria).toEqual([
      { criterion_id: 'criterion-1', verifier_type: 'dev-static', params: { satisfied: true } },
    ]);
    expect(params.lockLogic).toEqual({ type: 'all', criteria: ['criterion-1'] });
    expect(params.accessPolicy).toEqual({ requested_credential_ttl_seconds: 900 });
  });

  it('rejects when there is no Locks session', async () => {
    useLocksAuthStore.getState().reset();

    const error = await LocksController.createLockContent({ buildPost }).catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect(mocks.registerGuardedResource).not.toHaveBeenCalled();
  });

  it('does not build the post or create the lock when an attachment upload fails', async () => {
    mocks.registerGuardedResource.mockRejectedValueOnce(new Error('upload failed'));
    const builder = vi.fn(() => file());

    await expect(
      LocksController.createLockContent({ attachments: [file('image/png')], buildPost: builder }),
    ).rejects.toThrow('upload failed');

    expect(builder).not.toHaveBeenCalled();
    expect(mocks.createContentLock).not.toHaveBeenCalled();
  });
});
