import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCategory } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksService } from './locks';

const mocks = vi.hoisted(() => {
  const setLockServicePointer = vi.fn(async () => {});
  const fakeSession = {
    exportSecret: vi.fn(() => 'secret-abc'),
    signout: vi.fn(async () => {}),
    creator: { setLockServicePointer },
  };
  const fakeViewer = {
    id: 'viewer',
    submitProofBundle: vi.fn(async () => ({ status: 'pending' })),
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
    getTestnet: vi.fn(() => true),
    getLockServer: vi.fn((): string | undefined => 'lockserverpubky'),
    setLockServicePointer,
    fakeSession,
    fakeLocks,
    fakeViewer,
    registerGuardedResource: vi.fn(),
    createContentLock: vi.fn(),
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
}));

vi.mock('@pubky/locks-sdk', () => {
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
    CreateContentLockRequestBuilder,
    VerificationTaskHandleOptions,
    BundleId: { generate: mocks.generateBundleId },
    Locks: {
      forServerWithOptions: mocks.forServerWithOptions,
      readContentLockWithOptions: mocks.readContentLockWithOptions,
    },
  };
});

describe('LocksService (auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
    const session = await LocksService.restoreSession();
    expect(session).toBe(mocks.fakeSession);
    expect(mocks.fakeLocks.restoreSession).toHaveBeenCalledWith('secret-abc');
  });

  it('restoreSession throws an auth error when the store holds no secret', async () => {
    const error = await LocksService.restoreSession().catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
    expect(mocks.fakeLocks.restoreSession).not.toHaveBeenCalled();
  });

  it('signout delegates to the store session', async () => {
    useLocksAuthStore.getState().init({ session: mocks.fakeSession as never, secret: 'secret-abc' });
    await LocksService.signout();
    expect(mocks.fakeSession.signout).toHaveBeenCalled();
  });

  it('setLockServiceConfig writes the pointer through the store session with the configured lock server', async () => {
    useLocksAuthStore.getState().init({ session: mocks.fakeSession as never, secret: 'secret-abc' });
    await LocksService.setLockServiceConfig();
    expect(mocks.setLockServicePointer).toHaveBeenCalledWith(
      expect.objectContaining({ default_lock_server: 'lockserverpubky' }),
    );
  });

  // Session-backed auth calls share the content calls' 401 → typed-auth-error promotion.
  it.each([
    ['signout', () => LocksService.signout(), () => mocks.fakeSession.signout],
    ['setLockServiceConfig', () => LocksService.setLockServiceConfig(), () => mocks.setLockServicePointer],
  ])('%s promotes an HTTP 401 to an auth error', async (_name, call, mock) => {
    useLocksAuthStore.getState().init({ session: mocks.fakeSession as never, secret: 'secret-abc' });
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
  creator: { registerGuardedResource: mocks.registerGuardedResource, createContentLock: mocks.createContentLock },
  lockServer: () => 'lockpubky',
});

const descriptor = { path: '/priv/locks.app/content/id-1', hash: 'H', content_type: 'image/png', size: 1 };

const lockParams = {
  primaryResource: descriptor,
  criteria: [],
  lockLogic: { type: 'all', criteria: [] },
  accessPolicy: { requested_credential_ttl_seconds: 900 },
};

describe('LocksService (content)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLocksAuthStore.setState(locksAuthInitialState);
    useLocksAuthStore.getState().init({ session, secret: 'secret-abc' });
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
      content_lock_path: '/pub/locks.app/LOCK1.json',
      content_lock: { creator: 'pubkybob' },
    });

    const result = await LocksService.createContentLock(lockParams);

    expect(result).toEqual({ lock_id: 'LOCK1', content_lock_path: '/pub/locks.app/LOCK1.json', creator: 'pubkybob' });
  });

  it.each([
    [
      'registerGuardedResource',
      () =>
        LocksService.registerGuardedResource({ path: 'id-1', contentType: 'image/png', bytes: new Uint8Array([1]) }),
      mocks.registerGuardedResource,
    ],
    ['createContentLock', () => LocksService.createContentLock(lockParams), mocks.createContentLock],
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

  it('returns true when /readyz responds 2xx', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(LocksService.isServerReady(origin)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://lock.server/readyz', { method: 'GET' });
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
});

describe('LocksService (reader unlock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLockServer.mockReturnValue('lockserverpubky');
    LocksService['locksClient'] = null;
    LocksService['viewerClient'] = null;
  });

  it('readContentLock strips the pubky:// scheme and reads via the SDK', async () => {
    const result = await LocksService.readContentLock('pubky://creatorb/pub/locks.app/lock1.json');

    expect(mocks.readContentLockWithOptions).toHaveBeenCalledWith(
      'creatorb/pub/locks.app/lock1.json',
      expect.anything(),
    );
    expect(result).toEqual({ version: 1, creator: 'pubkybob' });
  });

  it('readContentLock wraps a wasm init failure as an AppError', async () => {
    mocks.ensureLocksSdkReady.mockRejectedValueOnce(new Error('wasm init failed'));

    const error = await LocksService.readContentLock('pubky://creatorb/pub/locks.app/lock1.json').catch(
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

  it('submitProofBundle sends the bundle to the viewer (never the password) and returns the task state', async () => {
    const bundle = { version: 1, bundle_id: 'b1', pubky_lock_resource: 'creator/pub/l.json', proofs: [] };
    const task = await LocksService.submitProofBundle(bundle, 'hunter2');

    // The password is intentionally not forwarded to the SDK (no password verifier yet).
    expect(mocks.fakeViewer.submitProofBundle).toHaveBeenCalledWith(bundle);
    expect(task).toEqual({ status: 'pending' });
  });

  it('lookupVerificationTask polls by the { creator, bundleId } handle', async () => {
    const task = await LocksService.lookupVerificationTask('creator-b', 'b1');

    expect(mocks.fakeViewer.lookupVerificationTask).toHaveBeenCalledWith(
      expect.objectContaining({ creator: 'creator-b', bundle_id: 'b1' }),
    );
    expect(task).toEqual({ status: 'completed' });
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
