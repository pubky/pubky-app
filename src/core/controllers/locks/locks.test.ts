import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksApplication } from '@/application/locks/locks';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { type LockFile, VerifierType } from '@/services/locks/locks.types';
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
  fetchLockFile: vi.fn(),
  unlockContent: vi.fn(),
  fetchUnlockedContent: vi.fn(),
  replicateUnlockedContent: vi.fn(),
  fetchReplicatedContent: vi.fn(),
  fetchOwnContent: vi.fn(),
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
    fetchLockFile: mocks.fetchLockFile,
    unlockContent: mocks.unlockContent,
    fetchUnlockedContent: mocks.fetchUnlockedContent,
    replicateUnlockedContent: mocks.replicateUnlockedContent,
    fetchReplicatedContent: mocks.fetchReplicatedContent,
    fetchOwnContent: mocks.fetchOwnContent,
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
    it('rebuilds the session, validates it against the server, and keeps it on success', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
      mocks.restoreSession.mockReturnValue(fakeSession);

      await LocksController.restorePersistedLocksSession();

      expect(mocks.restoreSession).toHaveBeenCalledTimes(1);
      expect(mocks.setLockServiceConfig).toHaveBeenCalledTimes(1); // validity probe
      expect(useLocksAuthStore.getState().selectLocksSession()).toBe(fakeSession);
    });

    it('clears the session when the server rejects the restored secret as expired (401 → Auth)', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
      mocks.restoreSession.mockReturnValue(fakeSession);
      mocks.setLockServiceConfig.mockRejectedValue(
        Err.auth(AuthErrorCode.SESSION_EXPIRED, 'rejected', { service: ErrorService.Locks, operation: 'test' }),
      );

      await LocksController.restorePersistedLocksSession();

      const store = useLocksAuthStore.getState();
      expect(store.selectIsLocksAuthenticated()).toBe(false);
      expect(store.selectLocksSessionSecret()).toBeNull();
    });

    it('keeps the session when the validation write fails for a non-auth reason', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
      mocks.restoreSession.mockReturnValue(fakeSession);
      mocks.setLockServiceConfig.mockRejectedValue(new Error('network down'));

      await LocksController.restorePersistedLocksSession();

      expect(useLocksAuthStore.getState().selectLocksSession()).toBe(fakeSession);
    });

    it('no-ops when there is no persisted secret', async () => {
      await LocksController.restorePersistedLocksSession();
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('no-ops when a live session already exists', async () => {
      useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
      await LocksController.restorePersistedLocksSession();
      expect(mocks.restoreSession).not.toHaveBeenCalled();
    });

    it('clears the store when restore throws (malformed/stale secret)', async () => {
      useLocksAuthStore.getState().init({ session: null, secret: 'bad-secret' });
      mocks.restoreSession.mockImplementation(() => {
        throw new Error('invalid secret');
      });

      await LocksController.restorePersistedLocksSession();

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

// TODO:[Locks] #1998 — inline test fixtures (sample lock file + author pubky) are
// duplicated across the lock tests; consider extracting a shared test util/fixture.
const MOCK_LOCK_AUTHOR_PUBKY = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const MOCK_LOCK_FILE: LockFile = {
  version: 1,
  creator: 'pubkycreator123',
  primary_resource: {
    path: '/priv/locks.app/content/example.txt',
    hash: '<hash>',
    content_type: 'text/plain',
    size: 13,
  },
  secondary_resources: {},
  criteria: [{ criterion_id: 'criterion-1', verifier_type: 'password', params: { satisfied: true } }],
  lock_logic: { type: 'all', criteria: ['criterion-1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: 'pubkyserver123' },
};

const VALID_LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`;

describe('LocksController.fetchLockFile', () => {
  beforeEach(() => {
    vi.mocked(LocksApplication.fetchLockFile).mockResolvedValue(MOCK_LOCK_FILE);
  });

  it('delegates to the application and resolves the verifier type', async () => {
    await expect(LocksController.fetchLockFile({ lockUrl: VALID_LOCK_URL })).resolves.toEqual({
      lockFile: MOCK_LOCK_FILE,
      verifierType: VerifierType.PASSWORD,
    });
    expect(LocksApplication.fetchLockFile).toHaveBeenCalledWith({ lockUrl: VALID_LOCK_URL });
  });

  it('resolves a null verifier type without a lock file', async () => {
    vi.mocked(LocksApplication.fetchLockFile).mockResolvedValue(null);

    await expect(LocksController.fetchLockFile({ lockUrl: VALID_LOCK_URL })).resolves.toEqual({
      lockFile: null,
      verifierType: null,
    });
  });
});

describe('LocksController.getLockContent', () => {
  it('parses the announcement content of a lock post', () => {
    const content = JSON.stringify({ lock_title: 't', teaser_description: 'd' });
    expect(LocksController.getLockContent(content)?.lock_title).toBe('t');
  });

  it('returns null for non-lock content', () => {
    expect(LocksController.getLockContent('not json')).toBeNull();
  });
});

describe('LocksController.unlock', () => {
  it('delegates the reader unlock to the application', async () => {
    const params = { lockFile: MOCK_LOCK_FILE, lockUrl: VALID_LOCK_URL, password: 'hunter2' };
    mocks.unlockContent.mockResolvedValue({ bundleId: 'b1', credential: 'cred', expiresAt: '2026-01-01' });

    await expect(LocksController.unlock(params)).resolves.toEqual({
      bundleId: 'b1',
      credential: 'cred',
      expiresAt: '2026-01-01',
    });
    expect(mocks.unlockContent).toHaveBeenCalledWith(params);
  });
});

describe('LocksController.fetchUnlockedContent', () => {
  it('delegates reading the guarded content to the application', async () => {
    const params = { lockFile: MOCK_LOCK_FILE, credential: 'cred-abc' };
    const content = { post: { content: 'secret', kind: 'short', attachments: null }, attachments: [] };
    mocks.fetchUnlockedContent.mockResolvedValue(content);

    await expect(LocksController.fetchUnlockedContent(params)).resolves.toEqual(content);
    expect(mocks.fetchUnlockedContent).toHaveBeenCalledWith(params);
  });
});

describe('LocksController.fetchReplicatedContent', () => {
  it('delegates loading the reader-replicated content to the application', async () => {
    const params = { lockUrl: VALID_LOCK_URL, readerPubky: 'pubkyreader' };
    const content = { post: { content: 'secret', kind: 'short', attachments: null }, attachments: [] };
    mocks.fetchReplicatedContent.mockResolvedValue(content);

    await expect(LocksController.fetchReplicatedContent(params)).resolves.toEqual(content);
    expect(mocks.fetchReplicatedContent).toHaveBeenCalledWith(params);
  });
});

describe('LocksController.fetchOwnContent', () => {
  it("delegates loading the creator's own guarded content to the application", async () => {
    const params = { lockFile: MOCK_LOCK_FILE };
    const content = { post: { content: 'mine', kind: 'short', attachments: null }, attachments: [] };
    mocks.fetchOwnContent.mockResolvedValue(content);

    await expect(LocksController.fetchOwnContent(params)).resolves.toEqual(content);
    expect(mocks.fetchOwnContent).toHaveBeenCalledWith(params);
  });
});
