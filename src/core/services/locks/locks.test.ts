import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isAppError, isRetryable } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { LOCKS_UNLOCK_POLL_CALL_SITES } from '@/libs/observability/sentry.constants';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksService } from './locks';
import { LOCKS_REQUEST_TIMEOUT_MS, LOCKS_TRANSFER_TIMEOUT_MS, READYZ_TIMEOUT_MS } from './locks.utils';

const mocks = vi.hoisted(() => {
  const setLockServicePointer = vi.fn(async () => {});
  const paykitSetupStatus = vi.fn(async (): Promise<unknown> => ({ status: 'ready' }));
  const fakeSession = {
    exportSecret: vi.fn(() => 'secret-abc'),
    creatorPubky: vi.fn((): string | undefined => 'pubkyaccount'),
    signout: vi.fn(async () => {}),
    creator: { setLockServicePointer, paykitSetupStatus },
  };
  const fakeViewer = {
    id: 'viewer',
    submitProofBundle: vi.fn(async () => ({ status: 'pending' })),
    lookupPaykitConnectionState: vi.fn(async () => ({ state: 'handshake' })),
    lookupVerificationTask: vi.fn(async () => ({ status: 'completed' })),
    issueAccessCredential: vi.fn(async () => ({ credential: 'cred-abc', expires_at: '2026-01-01' })),
    proxyReadGuardedResource: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const fakeLocks = {
    createConnectUrl: vi.fn(async () => 'https://connect.url/'),
    exchangeFrontendSessionCode: vi.fn(async () => fakeSession),
    restoreSession: vi.fn(() => fakeSession),
    viewer: fakeViewer,
  };
  return {
    addPkarrRelay: vi.fn(),
    setLocalTestnetHomeserver: vi.fn(),
    forServerWithOptions: vi.fn(() => fakeLocks),
    hasPaykitDataWithOptions: vi.fn(async () => true),
    getTestnet: vi.fn(() => true),
    getLockServer: vi.fn((): string | undefined => 'lockserverpubky'),
    getPaykitServerUrl: vi.fn((): string | undefined => 'https://paykit.server'),
    getE2eLocksStubUrl: vi.fn((): string | undefined => undefined),
    setLockServicePointer,
    paykitSetupStatus,
    fakeSession,
    fakeLocks,
    fakeViewer,
    registerGuardedResource: vi.fn(),
    createContentLock: vi.fn(),
    deleteContentLock: vi.fn(),
    deleteGuardedResource: vi.fn(),
    readContentLockWithOptions: vi.fn(async () => ({ version: 1, creator: 'pubkybob' })),
    generateBundleId: vi.fn(() => ({ toString: () => 'bundle-generated' })),
    ensureLocksSdkReady: vi.fn(async () => {}),
  };
});

// Real memoization caches the first successful init, so a per-test failure needs the mock.
vi.mock('./locks.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./locks.utils')>();
  return { ...actual, ensureLocksSdkReady: mocks.ensureLocksSdkReady };
});

vi.mock('@/config/network', () => ({
  getPkarrRelays: () => ['https://pkarr.example/inbox'],
  getTestnet: mocks.getTestnet,
  getHomeserver: () => 'homeservertestpubky',
  getLockServer: mocks.getLockServer,
  getPaykitServerUrl: mocks.getPaykitServerUrl,
  getE2eLocksStubUrl: mocks.getE2eLocksStubUrl,
}));

vi.mock('@synonymdev/locks-sdk', () => {
  class LocksOptions {
    addPkarrRelay = mocks.addPkarrRelay;
    setLocalTestnetHomeserver = mocks.setLocalTestnetHomeserver;
  }
  class ConnectUrlOptions {
    constructor(
      public return_to: string,
      public state: string,
    ) {}
  }
  class ExchangeFrontendSessionCodeOptions {
    constructor(
      public code: string,
      public state: string,
    ) {}
  }
  class SetLockServicePointerOptions {
    constructor(public default_lock_server: string) {}
  }
  class RegisterGuardedResourceOptions {
    constructor(
      public path: string,
      public contentType: string,
      public bytes: Uint8Array,
    ) {}
  }
  class DeleteGuardedResourceOptions {
    constructor(public path: string) {}
  }
  class CreateContentLockRequestBuilder {
    primaryResource() {
      return this;
    }
    secondaryResource() {
      return this;
    }
    criteria() {
      return this;
    }
    lockLogic() {
      return this;
    }
    accessPolicy() {
      return this;
    }
    lockServer() {
      return this;
    }
    build() {
      return { body: true };
    }
  }
  class VerificationTaskHandleOptions {
    constructor(
      public creator: string,
      public bundle_id: string,
    ) {}
  }
  return {
    // The real web-build SDK default-exports its wasm init(); the service awaits it before any call.
    default: async () => ({}),
    LocksOptions,
    ConnectUrlOptions,
    ExchangeFrontendSessionCodeOptions,
    SetLockServicePointerOptions,
    RegisterGuardedResourceOptions,
    DeleteGuardedResourceOptions,
    CreateContentLockRequestBuilder,
    VerificationTaskHandleOptions,
    BundleId: { generate: mocks.generateBundleId },
    Locks: {
      forServerWithOptions: mocks.forServerWithOptions,
      readContentLockWithOptions: mocks.readContentLockWithOptions,
      hasPaykitDataWithOptions: mocks.hasPaykitDataWithOptions,
    },
  };
});

describe('LocksService (auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentUserPubky: 'account' });
    mocks.getLockServer.mockReturnValue('lockserverpubky');
    useLocksAuthStore.setState(locksAuthInitialState);
    // The client is a cached singleton; tests below assert construction, so build fresh per test.
    LocksService['locksClient'] = null;
    LocksService['viewerClient'] = null;
  });

  it('generateConnectUrl builds a client bound to the configured Lock Server and returns the /connect URL with delivery=postmessage', async () => {
    const url = await LocksService.generateConnectUrl({
      returnTo: 'https://staging.pubky.app',
      state: 'opaque-state',
    });

    expect(url).toBe('https://connect.url/?delivery=postmessage');
    expect(mocks.forServerWithOptions).toHaveBeenCalledWith('lockserverpubky', expect.anything());
    expect(mocks.addPkarrRelay).toHaveBeenCalledWith('https://pkarr.example/inbox');
    expect(mocks.setLocalTestnetHomeserver).not.toHaveBeenCalled();
    expect(mocks.fakeLocks.createConnectUrl).toHaveBeenCalledWith(
      expect.objectContaining({ return_to: 'https://staging.pubky.app', state: 'opaque-state' }),
    );
  });

  it('builds the client once and reuses it across calls (singleton)', async () => {
    // Each public method calls the private getLocksClient() internally — so two client lookups here.
    await LocksService.generateConnectUrl({ returnTo: 'https://staging.pubky.app', state: 'state-1' });
    await LocksService.exchangeSessionCode({ code: 'CODE', state: 'state-2' });

    expect(mocks.forServerWithOptions).toHaveBeenCalledTimes(1);
    expect(mocks.fakeLocks.createConnectUrl).toHaveBeenCalledTimes(1);
    expect(mocks.fakeLocks.exchangeFrontendSessionCode).toHaveBeenCalledTimes(1); // both calls served by the one client
  });

  it('rejects without touching the SDK when no Lock Server is configured', async () => {
    mocks.getLockServer.mockReturnValue(undefined);
    await expect(
      LocksService.generateConnectUrl({ returnTo: 'https://staging.pubky.app', state: 'opaque-state' }),
    ).rejects.toThrow('No Lock Server configured');
    expect(mocks.forServerWithOptions).not.toHaveBeenCalled();
  });

  it('getViewer builds a session-less reader Viewer on the configured Lock Server', async () => {
    const viewer = await LocksService.getViewer();

    expect(viewer).toBe(mocks.fakeViewer);
    // Reader Viewer is public (no session) and uses the configured server — every lock shares it for now.
    expect(mocks.forServerWithOptions).toHaveBeenCalledWith('lockserverpubky', expect.anything());
  });

  it('exchangeSessionCode returns the session and freshly exported secret', async () => {
    const result = await LocksService.exchangeSessionCode({ code: 'CODE', state: 'STATE' });
    expect(result).toEqual({ session: mocks.fakeSession, secret: 'secret-abc' });
    expect(mocks.fakeLocks.exchangeFrontendSessionCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CODE', state: 'STATE' }),
    );
  });

  it('restoreSession rebuilds a session from the persisted secret in the store', async () => {
    useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc', creatorPubky: 'account' });
    const session = await LocksService.restoreSession();
    expect(session).toBe(mocks.fakeSession);
    expect(mocks.fakeLocks.restoreSession).toHaveBeenCalledWith('secret-abc');
  });

  it('restoreSession rebuilds from a secret the caller passes, even after the store was cleared', async () => {
    const session = await LocksService.restoreSession('secret-captured');
    expect(session).toBe(mocks.fakeSession);
    expect(mocks.fakeLocks.restoreSession).toHaveBeenCalledWith('secret-captured');
  });

  it('restoreSession throws an auth error when the store holds no secret', async () => {
    const error = await LocksService.restoreSession().catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
    expect(mocks.fakeLocks.restoreSession).not.toHaveBeenCalled();
  });

  it('signout delegates to the store session', async () => {
    useLocksAuthStore
      .getState()
      .init({ session: mocks.fakeSession as never, secret: 'secret-abc', creatorPubky: 'account' });
    await LocksService.signout();
    expect(mocks.fakeSession.signout).toHaveBeenCalled();
  });

  it('signout signs out the given session instead of the stored one', async () => {
    const other = { signout: vi.fn(async () => {}) };
    await LocksService.signout(other as never);
    expect(other.signout).toHaveBeenCalledTimes(1);
  });

  it('setLockServiceConfig writes the pointer through the store session with the configured lock server', async () => {
    useLocksAuthStore
      .getState()
      .init({ session: mocks.fakeSession as never, secret: 'secret-abc', creatorPubky: 'account' });
    await LocksService.setLockServiceConfig();
    expect(mocks.setLockServicePointer).toHaveBeenCalledWith(
      expect.objectContaining({ default_lock_server: 'lockserverpubky' }),
    );
  });

  it('lookupPaykitSetupStatus returns the status the Lock Server reports for the session creator', async () => {
    useLocksAuthStore
      .getState()
      .init({ session: mocks.fakeSession as never, secret: 'secret-abc', creatorPubky: 'account' });
    mocks.paykitSetupStatus.mockResolvedValueOnce({ status: 'setup_required' });

    await expect(LocksService.lookupPaykitSetupStatus('BTC')).resolves.toBe('setup_required');
    expect(mocks.paykitSetupStatus).toHaveBeenCalledWith('BTC'); // the creator comes from the session
  });

  // The SDK types the response `any`: an unknown status must fail, not read as a setup answer.
  it('lookupPaykitSetupStatus rejects an unknown status', async () => {
    useLocksAuthStore
      .getState()
      .init({ session: mocks.fakeSession as never, secret: 'secret-abc', creatorPubky: 'account' });
    mocks.paykitSetupStatus.mockResolvedValueOnce({ status: 'connected' });

    const error = await LocksService.lookupPaykitSetupStatus('BTC').catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({
      category: ErrorCategory.Validation,
      code: ValidationErrorCode.INVALID_INPUT,
      operation: 'LocksService.lookupPaykitSetupStatus',
    });
  });

  // Session-backed auth calls share the content calls' 401 → typed-auth-error promotion.
  it.each([
    ['signout', () => LocksService.signout(), () => mocks.fakeSession.signout],
    ['setLockServiceConfig', () => LocksService.setLockServiceConfig(), () => mocks.setLockServicePointer],
    ['lookupPaykitSetupStatus', () => LocksService.lookupPaykitSetupStatus('BTC'), () => mocks.paykitSetupStatus],
  ])('%s promotes an HTTP 401 to an auth error', async (_name, call, mock) => {
    useLocksAuthStore
      .getState()
      .init({ session: mocks.fakeSession as never, secret: 'secret-abc', creatorPubky: 'account' });
    mock().mockRejectedValueOnce(new Error('Lock Server request failed with HTTP 401'));

    const error = await call().catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
  });

  it('maps SDK failures to an AppError under the Locks service', async () => {
    mocks.fakeLocks.createConnectUrl.mockRejectedValueOnce(new Error('pkarr resolve failed'));
    const error = await LocksService.generateConnectUrl({
      returnTo: 'https://staging.pubky.app/locks/callback',
      state: 'opaque-state',
    }).catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
  });
});

const session = asOpaque<LocksSdkSession>({
  creatorPubky: () => 'pubkyaccount',
  creator: {
    registerGuardedResource: mocks.registerGuardedResource,
    createContentLock: mocks.createContentLock,
    deleteContentLock: mocks.deleteContentLock,
    deleteGuardedResource: mocks.deleteGuardedResource,
  },
  lockServer: () => 'lockpubky',
});

const descriptor = { path: '/priv/app.locks/content/id-1', hash: 'H', content_type: 'image/png', size: 1 };

const lockParams = {
  primaryResource: descriptor,
  criteria: [],
  lockLogic: { type: 'all', criteria: [] },
  accessPolicy: { requested_credential_ttl_seconds: 900 },
};

describe('LocksService (content)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentUserPubky: 'account' });
    useLocksAuthStore.setState(locksAuthInitialState);
    useLocksAuthStore.getState().init({ session, secret: 'secret-abc', creatorPubky: 'account' });
  });

  it('registerGuardedResource returns the descriptor and the owner pubky', async () => {
    mocks.registerGuardedResource.mockResolvedValue({ guarded_resource: descriptor, creator: 'pubkybob' });

    const result = await LocksService.registerGuardedResource({
      path: 'id-1',
      contentType: 'image/png',
      bytes: new Uint8Array([1]),
    });

    expect(result).toEqual({ resource: descriptor, creator: 'pubkybob' });
  });

  it('createContentLock returns the lock descriptor', async () => {
    mocks.createContentLock.mockResolvedValue({
      lock_id: 'LOCK1',
      content_lock_path: '/pub/app.locks/LOCK1.json',
      content_lock: { creator: 'pubkybob' },
    });

    const result = await LocksService.createContentLock(lockParams);

    expect(result).toEqual({ lock_id: 'LOCK1', content_lock_path: '/pub/app.locks/LOCK1.json', creator: 'pubkybob' });
  });

  // No options = the server's default graceful mode; `force` must never be chosen by the app.
  it('deleteContentLock asks the Lock Server for the default (graceful) deletion of the lock id', async () => {
    mocks.deleteContentLock.mockResolvedValue({ lock_id: 'LOCK1', status: 'queued' });

    await expect(LocksService.deleteContentLock('LOCK1')).resolves.toBeUndefined();

    expect(mocks.deleteContentLock).toHaveBeenCalledWith('LOCK1');
  });

  it('deleteGuardedResource addresses the resource by the path it was registered under', async () => {
    mocks.deleteGuardedResource.mockResolvedValue(undefined);

    await expect(LocksService.deleteGuardedResource('id-1')).resolves.toBeUndefined();

    expect(mocks.deleteGuardedResource).toHaveBeenCalledWith(expect.objectContaining({ path: 'id-1' }));
  });

  it.each([
    [
      'registerGuardedResource',
      () =>
        LocksService.registerGuardedResource({ path: 'id-1', contentType: 'image/png', bytes: new Uint8Array([1]) }),
      mocks.registerGuardedResource,
    ],
    ['createContentLock', () => LocksService.createContentLock(lockParams), mocks.createContentLock],
    ['deleteContentLock', () => LocksService.deleteContentLock('LOCK1'), mocks.deleteContentLock],
    ['deleteGuardedResource', () => LocksService.deleteGuardedResource('id-1'), mocks.deleteGuardedResource],
  ])('%s throws an auth error without touching the server when no Locks session exists', async (_name, call, mock) => {
    useLocksAuthStore.getState().reset();

    const error = await call().catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
    expect(mock).not.toHaveBeenCalled();
  });

  // The SDK exposes no status field — an HTTP 401 only shows up in the message.
  it.each([
    [
      'registerGuardedResource',
      () =>
        LocksService.registerGuardedResource({ path: 'id-1', contentType: 'image/png', bytes: new Uint8Array([1]) }),
      mocks.registerGuardedResource,
    ],
    ['createContentLock', () => LocksService.createContentLock(lockParams), mocks.createContentLock],
    ['deleteContentLock', () => LocksService.deleteContentLock('LOCK1'), mocks.deleteContentLock],
    ['deleteGuardedResource', () => LocksService.deleteGuardedResource('id-1'), mocks.deleteGuardedResource],
  ])('%s promotes an HTTP 401 to an auth error', async (_name, call, mock) => {
    mock.mockRejectedValue(new Error('Lock Server request failed with HTTP 401'));

    const error = await call().catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
  });
});

describe('LocksService.isServerReady', () => {
  const origin = 'https://lock.server';

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when /readyz responds 2xx', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(LocksService.isServerReady(origin)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://lock.server/readyz', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    });
  });

  it('returns false when /readyz responds non-2xx (server not ready)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response),
    );
    await expect(LocksService.isServerReady(origin)).resolves.toBe(false);
  });

  it('returns false when the server is unreachable (fetch throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(LocksService.isServerReady(origin)).resolves.toBe(false);
  });

  it('aborts the probe and returns false when the server never answers', async () => {
    const timeout = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
          }),
      ),
    );
    const ready = LocksService.isServerReady(origin);

    timeout.abort();

    await expect(ready).resolves.toBe(false);
    expect(timeoutSpy).toHaveBeenCalledWith(READYZ_TIMEOUT_MS);
  });
});

describe('LocksService (reader unlock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentUserPubky: 'account' });
    mocks.getLockServer.mockReturnValue('lockserverpubky');
    LocksService['locksClient'] = null;
    LocksService['viewerClient'] = null;
  });

  it('readContentLock strips the pubky:// scheme and reads via the SDK', async () => {
    const result = await LocksService.readContentLock('pubky://creatorb/pub/app.locks/lock1.json');

    expect(mocks.readContentLockWithOptions).toHaveBeenCalledWith(
      'creatorb/pub/app.locks/lock1.json',
      expect.anything(),
    );
    expect(result).toEqual({ version: 1, creator: 'pubkybob' });
  });

  it('readContentLock wraps a wasm init failure as an AppError', async () => {
    mocks.ensureLocksSdkReady.mockRejectedValueOnce(new Error('wasm init failed'));

    const error = await LocksService.readContentLock('pubky://creatorb/pub/app.locks/lock1.json').catch(
      (e: unknown) => e,
    );
    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ operation: 'LocksService.readContentLock' });
  });

  it('generateBundleId returns a fresh reader-generated id', async () => {
    await expect(LocksService.generateBundleId()).resolves.toBe('bundle-generated');
  });

  it('generateBundleId wraps an SDK failure as an AppError', async () => {
    mocks.generateBundleId.mockImplementationOnce(() => {
      throw new Error('wasm not ready');
    });

    const error = await LocksService.generateBundleId().catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ operation: 'LocksService.generateBundleId' });
  });

  it('lookupVerificationTask polls by the { creator, bundleId } handle', async () => {
    const task = await LocksService.lookupVerificationTask('creator-b', 'b1');

    expect(mocks.fakeViewer.lookupVerificationTask).toHaveBeenCalledWith(
      expect.objectContaining({ creator: 'creator-b', bundle_id: 'b1' }),
    );
    expect(task).toEqual({
      status: 'completed',
      walletSetupNeeded: false,
      readerNotPayable: false,
      admissionDeadlineAt: null,
      completedAt: null,
    });
  });

  it('lookupVerificationTask reports the wallet setup notice and the invoice deadline', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockResolvedValueOnce({
      status: 'pending',
      status_message: 'Reader wallet setup needed',
      admission_deadline_at: '2026-10-08T12:10:00Z',
    } as never);

    await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).resolves.toEqual({
      status: 'pending',
      walletSetupNeeded: true,
      readerNotPayable: false,
      admissionDeadlineAt: '2026-10-08T12:10:00Z',
      completedAt: null,
    });
  });

  const FAILURE_MESSAGES = [
    ['reader is not payable', true],
    ['invoice admission deadline exceeded', false],
    ['paykit invoice admission failed', false],
    ['Reader is not payable', false],
    ['reader is not payable.', false],
  ] as const;

  it.each(FAILURE_MESSAGES)(
    'lookupVerificationTask matches the failure message %j exactly',
    async (failureMessage, readerNotPayable) => {
      mocks.fakeViewer.lookupVerificationTask.mockResolvedValueOnce({
        status: 'failed',
        failure_message: failureMessage,
        completed_at: '2026-10-08T09:52:51Z',
      } as never);

      await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).resolves.toEqual({
        status: 'failed',
        walletSetupNeeded: false,
        readerNotPayable,
        admissionDeadlineAt: null,
        completedAt: '2026-10-08T09:52:51Z',
      });
    },
  );

  it('lookupVerificationTask rejects an unknown lifecycle status', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockResolvedValueOnce({ status: 'refunded' } as never);

    await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).rejects.toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
      operation: 'LocksService.lookupVerificationTask',
    });
  });

  it('submitProof sends the bundle to the viewer', async () => {
    const bundle = { version: 1, bundle_id: 'b1', pubky_lock_resource: 'creator/pub/l.json', proofs: [] };
    const task = await LocksService.submitProof(bundle);

    expect(mocks.fakeViewer.submitProofBundle).toHaveBeenCalledWith(bundle);
    expect(task).toEqual({ status: 'pending', readerNotPayable: false });
  });

  // A replayed submission answers with the task it already has, which may have failed.
  it.each(FAILURE_MESSAGES)(
    'submitProof matches the failure message %j exactly',
    async (failureMessage, readerNotPayable) => {
      const bundle = { version: 1, bundle_id: 'b1', pubky_lock_resource: 'creator/pub/l.json', proofs: [] };
      mocks.fakeViewer.submitProofBundle.mockResolvedValueOnce({
        status: 'failed',
        failure_message: failureMessage,
      } as never);

      await expect(LocksService.submitProof(bundle)).resolves.toEqual({ status: 'failed', readerNotPayable });
    },
  );

  describe('submitProof when the Lock Server answers 451', () => {
    const bundle = { version: 1, bundle_id: 'b1', pubky_lock_resource: 'creator/pub/l.json', proofs: [] };

    it('returns a region-blocked result instead of throwing', async () => {
      mocks.fakeViewer.submitProofBundle.mockRejectedValueOnce(
        Object.assign(new Error('Lock Server viewer request failed with HTTP 451'), { name: 'InvalidInput' }),
      );

      await expect(LocksService.submitProof(bundle)).resolves.toEqual({ regionBlocked: true });
    });

    it('reports a bare string because it does not match the pinned SDK error contract', async () => {
      mocks.fakeViewer.submitProofBundle.mockRejectedValueOnce('Lock Server viewer request failed with HTTP 451');

      await expect(LocksService.submitProof(bundle)).rejects.toMatchObject({
        service: ErrorService.Locks,
        operation: 'LocksService.submitProof',
      });
    });

    it('builds no AppError, so nothing is logged or sent to Sentry', async () => {
      const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      mocks.fakeViewer.submitProofBundle.mockRejectedValueOnce(
        Object.assign(new Error('Lock Server viewer request failed with HTTP 451'), { name: 'InvalidInput' }),
      );

      await LocksService.submitProof(bundle);

      expect(logError).not.toHaveBeenCalled();
      logError.mockRestore();
    });

    it.each(['HTTP 429', 'HTTP 500', 'HTTP 403', 'HTTP 4510'])('still reports a %s as an error', async (statusText) => {
      const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      mocks.fakeViewer.submitProofBundle.mockRejectedValueOnce(
        new Error(`Lock Server viewer request failed with ${statusText}`),
      );

      const error = await LocksService.submitProof(bundle).catch((caught: unknown) => caught);

      expect(isAppError(error)).toBe(true);
      expect(logError).toHaveBeenCalled();
      logError.mockRestore();
    });
  });

  it('lookupPaykitConnectionState returns the state the server reports', async () => {
    await expect(LocksService.lookupPaykitConnectionState('creator-b', 'b1')).resolves.toBe('handshake');
  });

  it('lookupPaykitConnectionState rejects an unknown state', async () => {
    mocks.fakeViewer.lookupPaykitConnectionState.mockResolvedValueOnce({ state: 'weird' } as never);

    await expect(LocksService.lookupPaykitConnectionState('creator-b', 'b1')).rejects.toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
    });
  });

  it('lookupVerificationTask resolves to null when the server has no task for the bundle id', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(
      new Error('Lock Server request failed with HTTP 404'),
    );
    await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).resolves.toBeNull();
  });

  it('lookupVerificationTask rethrows non-404 failures', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(
      new Error('Lock Server request failed with HTTP 500'),
    );

    const error = await LocksService.lookupVerificationTask('creator-b', 'b1').catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ operation: 'LocksService.lookupVerificationTask' });
  });

  // The 404 is read from the message text, so a string rejection must count the same as an Error.
  it('lookupVerificationTask reads the 404 from a non-Error rejection too', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce('HTTP 404');
    await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).resolves.toBeNull();
  });

  describe('lookupVerificationTask when the Lock Server answers 451', () => {
    const refused = () =>
      Object.assign(new Error('Lock Server viewer request failed with HTTP 451'), { name: 'InvalidInput' });

    it('returns a region-blocked result instead of throwing, as submitProof does', async () => {
      mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(refused());

      await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).resolves.toEqual({ regionBlocked: true });
    });

    it('builds no AppError, so nothing is logged or sent to Sentry', async () => {
      const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(refused());

      await LocksService.lookupVerificationTask('creator-b', 'b1');

      expect(logError).not.toHaveBeenCalled();
      logError.mockRestore();
    });

    it('is not mistaken for a missing task, and other failures are still reported', async () => {
      mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(refused());
      await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).resolves.not.toBeNull();

      mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(
        Object.assign(new Error('Lock Server viewer request failed with HTTP 500'), { name: 'InvalidInput' }),
      );
      await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).rejects.toMatchObject({
        operation: 'LocksService.lookupVerificationTask',
      });
    });
  });

  it('lookupVerificationTask does not treat other 4xx as missing', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockRejectedValueOnce(
      new Error('Lock Server request failed with HTTP 403'),
    );
    await expect(LocksService.lookupVerificationTask('creator-b', 'b1')).rejects.toThrow();
  });

  it('hasPaykitReceiver asks the SDK with the pubky-prefixed reader', async () => {
    await expect(LocksService.hasPaykitReceiver('reader123')).resolves.toBe(true);
    expect(mocks.hasPaykitDataWithOptions).toHaveBeenCalledWith('pubkyreader123', expect.anything());
  });

  it('issueAccessCredential returns the bearer credential and expiry', async () => {
    const credential = await LocksService.issueAccessCredential('creator-b', 'b1');
    expect(credential).toEqual({ credential: 'cred-abc', expires_at: '2026-01-01' });
  });

  it('proxyReadGuardedResource returns the guarded bytes from the viewer', async () => {
    const bytes = await LocksService.proxyReadGuardedResource('cred-abc', 'content/a.json');
    expect(mocks.fakeViewer.proxyReadGuardedResource).toHaveBeenCalledWith('cred-abc', 'content/a.json');
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('LocksService.generatePaykitSetupUrl', () => {
  it('builds the /setup URL on the configured origin with both query params', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server');

    const url = new URL(LocksService.generatePaykitSetupUrl({ returnTo: 'https://app.example', state: 'STATE' }));

    expect(url.origin).toBe('https://paykit.server');
    expect(url.pathname).toBe('/setup');
    expect(url.searchParams.get('return_to')).toBe('https://app.example');
    expect(url.searchParams.get('state')).toBe('STATE');
  });

  it('percent-encodes both params, so a state survives the round trip verbatim', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server');
    const state = 'a b&c=d#e/f';

    const raw = LocksService.generatePaykitSetupUrl({ returnTo: 'https://app.example/x?y=1', state });

    expect(raw).not.toContain(' ');
    expect(new URL(raw).searchParams.get('state')).toBe(state);
    expect(new URL(raw).searchParams.get('return_to')).toBe('https://app.example/x?y=1');
  });

  it('drops any path on the configured Paykit URL', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server/nested/path');

    expect(new URL(LocksService.generatePaykitSetupUrl({ returnTo: 'https://app.example', state: 'S' })).pathname).toBe(
      '/setup',
    );
  });
});

describe('LocksService.generatePaykitReconnectUrl', () => {
  const creator = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';

  it('builds the /setup/reconnect URL on the configured origin with creator, return_to and state', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server');

    const url = new URL(
      LocksService.generatePaykitReconnectUrl({ returnTo: 'https://app.example', state: 'STATE', creator }),
    );

    expect(url.origin).toBe('https://paykit.server');
    expect(url.pathname).toBe('/setup/reconnect');
    expect(url.searchParams.get('creator')).toBe(`pubky${creator}`);
    expect(url.searchParams.get('return_to')).toBe('https://app.example');
    expect(url.searchParams.get('state')).toBe('STATE');
  });

  it('does not double the pubky prefix on a creator that already has it', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server');

    const url = new URL(
      LocksService.generatePaykitReconnectUrl({
        returnTo: 'https://app.example',
        state: 'S',
        creator: `pubky${creator}`,
      }),
    );

    expect(url.searchParams.get('creator')).toBe(`pubky${creator}`);
  });

  it('prefixes a raw creator key that itself starts with pubky', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server');
    const rawKeyStartingWithPubky = `pubkyb${'o'.repeat(46)}`;

    const url = new URL(
      LocksService.generatePaykitReconnectUrl({
        returnTo: 'https://app.example',
        state: 'S',
        creator: rawKeyStartingWithPubky,
      }),
    );

    expect(url.searchParams.get('creator')).toBe(`pubky${rawKeyStartingWithPubky}`);
  });

  it('drops any path on the configured Paykit URL', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server/setup');

    expect(
      new URL(LocksService.generatePaykitReconnectUrl({ returnTo: 'https://app.example', state: 'S', creator }))
        .pathname,
    ).toBe('/setup/reconnect');
  });

  it('fails when no Paykit Server is configured', () => {
    mocks.getPaykitServerUrl.mockReturnValue(undefined);

    expect(() =>
      LocksService.generatePaykitReconnectUrl({ returnTo: 'https://app.example', state: 'S', creator }),
    ).toThrow('No Paykit Server configured');
  });
});

describe('LocksService.lookupPaykitCreatorHeld', () => {
  const creator = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
  const params = { creator };

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the same-origin route with the prefixed creator only', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ held: true }));

    await expect(LocksService.lookupPaykitCreatorHeld(params)).resolves.toBe(true);

    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe('/api/paykit-creator');
    expect(url.searchParams.get('creator')).toBe(`pubky${creator}`);
    expect([...url.searchParams.keys()]).toEqual(['creator']);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' });
  });

  it('answers false when Paykit does not hold the creator', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ held: false }));

    await expect(LocksService.lookupPaykitCreatorHeld(params)).resolves.toBe(false);
  });

  it('throws on a failed probe instead of reading it as "not held"', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Internal server error' }, { status: 502 }));

    await expect(LocksService.lookupPaykitCreatorHeld(params)).rejects.toMatchObject({
      category: ErrorCategory.Server,
    });
  });

  it('throws on a network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(LocksService.lookupPaykitCreatorHeld(params)).rejects.toMatchObject({
      category: ErrorCategory.Network,
    });
  });

  it('throws a validation error on a response that is not { held: boolean }', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ held: 'yes' }));

    await expect(LocksService.lookupPaykitCreatorHeld(params)).rejects.toMatchObject({
      category: ErrorCategory.Validation,
    });
  });
});

describe('LocksService when the server never answers', () => {
  const hang = () => new Promise<never>(() => {});
  const creatorSession = asOpaque<LocksSdkSession>({
    creatorPubky: () => 'pubkyaccount',
    creator: {
      setLockServicePointer: mocks.setLockServicePointer,
      paykitSetupStatus: mocks.paykitSetupStatus,
      registerGuardedResource: mocks.registerGuardedResource,
      createContentLock: mocks.createContentLock,
      deleteContentLock: mocks.deleteContentLock,
      deleteGuardedResource: mocks.deleteGuardedResource,
    },
    lockServer: () => 'lockpubky',
  });
  const upload = () =>
    LocksService.registerGuardedResource({ path: 'id-1', contentType: 'image/png', bytes: new Uint8Array([1]) });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useAuthStore.setState({ currentUserPubky: 'account' });
    mocks.getLockServer.mockReturnValue('lockserverpubky');
    useLocksAuthStore.setState(locksAuthInitialState);
    useLocksAuthStore.getState().init({ session: creatorSession, secret: 'secret-abc', creatorPubky: 'account' });
    LocksService['locksClient'] = null;
    LocksService['viewerClient'] = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The outcome of `call` after `ms`, or null while it is still pending. */
  async function rejectionAfter(call: Promise<unknown>, ms: number) {
    let settled = false;
    const outcome = call.then(
      () => {
        settled = true;
        return { rejected: false as const };
      },
      (error: unknown) => {
        settled = true;
        return { rejected: true as const, error };
      },
    );
    await vi.advanceTimersByTimeAsync(ms);
    return settled ? outcome : null;
  }

  it.each([
    [
      'generateConnectUrl',
      mocks.fakeLocks.createConnectUrl,
      () => LocksService.generateConnectUrl({ returnTo: 'https://staging.pubky.app', state: 'opaque-state' }),
    ],
    [
      'exchangeSessionCode',
      mocks.fakeLocks.exchangeFrontendSessionCode,
      () => LocksService.exchangeSessionCode({ code: 'one-time', state: 'opaque-state' }),
    ],
    ['setLockServiceConfig', mocks.setLockServicePointer, () => LocksService.setLockServiceConfig()],
    ['lookupPaykitSetupStatus', mocks.paykitSetupStatus, () => LocksService.lookupPaykitSetupStatus('BTC')],
    ['createContentLock', mocks.createContentLock, () => LocksService.createContentLock(lockParams)],
    ['deleteContentLock', mocks.deleteContentLock, () => LocksService.deleteContentLock('LOCK1')],
    ['deleteGuardedResource', mocks.deleteGuardedResource, () => LocksService.deleteGuardedResource('id-1')],
    [
      'readContentLock',
      mocks.readContentLockWithOptions,
      () => LocksService.readContentLock('pubky://creatorb/pub/app.locks/lock1.json'),
    ],
    ['hasPaykitReceiver', mocks.hasPaykitDataWithOptions, () => LocksService.hasPaykitReceiver('reader')],
    [
      'submitProof',
      mocks.fakeViewer.submitProofBundle,
      () => LocksService.submitProof(asOpaque<Parameters<typeof LocksService.submitProof>[0]>({})),
    ],
    [
      'lookupVerificationTask',
      mocks.fakeViewer.lookupVerificationTask,
      () => LocksService.lookupVerificationTask('creator', 'bundle-1'),
    ],
    [
      'lookupPaykitConnectionState',
      mocks.fakeViewer.lookupPaykitConnectionState,
      () => LocksService.lookupPaykitConnectionState('creator', 'bundle-1'),
    ],
    [
      'issueAccessCredential',
      mocks.fakeViewer.issueAccessCredential,
      () => LocksService.issueAccessCredential('creator', 'bundle-1'),
    ],
  ])('%s fails with a retryable timeout instead of waiting forever', async (name, mock, call) => {
    vi.mocked(mock).mockImplementationOnce(hang);

    const outcome = await rejectionAfter(call(), LOCKS_REQUEST_TIMEOUT_MS);

    expect(outcome).toMatchObject({
      rejected: true,
      error: {
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        service: ErrorService.Locks,
        operation: `LocksService.${name}`,
      },
    });
    expect(outcome?.rejected && isAppError(outcome.error) && isRetryable(outcome.error)).toBe(true);
  });

  it.each([
    ['registerGuardedResource', mocks.registerGuardedResource, upload],
    [
      'proxyReadGuardedResource',
      mocks.fakeViewer.proxyReadGuardedResource,
      () => LocksService.proxyReadGuardedResource('cred-abc', '/priv/app.locks/content/id-1'),
    ],
  ])('%s waits the longer file transfer limit before it times out', async (name, mock, call) => {
    vi.mocked(mock).mockImplementationOnce(hang);
    const request = call();

    expect(await rejectionAfter(request, LOCKS_TRANSFER_TIMEOUT_MS - 1)).toBeNull();
    const outcome = await rejectionAfter(request, 1);

    expect(outcome).toMatchObject({
      rejected: true,
      error: { category: ErrorCategory.Timeout, operation: `LocksService.${name}` },
    });
  });

  it('tags a polling read timeout with its report, so the repeat-report drop rule still applies', async () => {
    mocks.fakeViewer.lookupVerificationTask.mockImplementationOnce(hang);
    const report = { callSite: LOCKS_UNLOCK_POLL_CALL_SITES.payment, reportSuppressed: true as const };

    const outcome = await rejectionAfter(
      LocksService.lookupVerificationTask('creator', 'bundle-1', report),
      LOCKS_REQUEST_TIMEOUT_MS,
    );

    expect(outcome).toMatchObject({ rejected: true, error: { context: report } });
  });

  it.each([
    [
      'exchangeSessionCode signs out a session',
      () => {
        mocks.fakeLocks.exchangeFrontendSessionCode.mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, LOCKS_REQUEST_TIMEOUT_MS + 1));
          return mocks.fakeSession;
        });
        return LocksService.exchangeSessionCode({ code: 'one-time', state: 'opaque-state' });
      },
      LOCKS_REQUEST_TIMEOUT_MS,
      () => expect(mocks.fakeSession.signout).toHaveBeenCalledOnce(),
    ],
    [
      'registerGuardedResource deletes an upload',
      () => {
        mocks.registerGuardedResource.mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, LOCKS_TRANSFER_TIMEOUT_MS + 1));
          return { guarded_resource: descriptor, creator: 'pubkybob' };
        });
        return upload();
      },
      LOCKS_TRANSFER_TIMEOUT_MS,
      () => expect(mocks.deleteGuardedResource).toHaveBeenCalledWith(expect.objectContaining({ path: 'id-1' })),
    ],
    [
      'createContentLock deletes a lock',
      () => {
        mocks.createContentLock.mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, LOCKS_REQUEST_TIMEOUT_MS + 1));
          return { lock_id: 'LATE1', content_lock_path: '/pub/app.locks/LATE1.json', content_lock: { creator: 'x' } };
        });
        return LocksService.createContentLock(lockParams);
      },
      LOCKS_REQUEST_TIMEOUT_MS,
      () => expect(mocks.deleteContentLock).toHaveBeenCalledWith('LATE1'),
    ],
  ])('after a timeout, %s that lands late', async (_name, call, timeoutMs, expectUndone) => {
    const outcome = await rejectionAfter(call(), timeoutMs);
    expect(outcome).toMatchObject({ rejected: true, error: { category: ErrorCategory.Timeout } });

    await vi.advanceTimersByTimeAsync(1);

    expectUndone();
  });

  it('leaves no timer behind once the server answers', async () => {
    await LocksService.lookupPaykitSetupStatus('BTC');

    expect(vi.getTimerCount()).toBe(0);
  });
});
