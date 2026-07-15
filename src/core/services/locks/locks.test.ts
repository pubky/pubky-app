import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCategory } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksService } from './locks';

const mocks = vi.hoisted(() => {
  const setLockServicePointer = vi.fn(async () => {});
  const fakeSession = {
    exportSecret: vi.fn(() => 'secret-abc'),
    signout: vi.fn(async () => {}),
    creator: { setLockServicePointer },
  };
  const fakeLocks = {
    createConnectUrl: vi.fn(async () => 'https://connect.url/'),
    exchangeFrontendSessionCode: vi.fn(async () => fakeSession),
    restoreSession: vi.fn(() => fakeSession),
  };
  return {
    addPkarrRelay: vi.fn(),
    setLocalTestnetHomeserver: vi.fn(),
    forServerWithOptions: vi.fn(() => fakeLocks),
    getTestnet: vi.fn(() => true),
    setLockServicePointer,
    fakeSession,
    fakeLocks,
    registerGuardedResource: vi.fn(),
    createContentLock: vi.fn(),
  };
});

vi.mock('@/config/network', () => ({
  getPkarrRelays: () => ['https://pkarr.example/inbox'],
  getTestnet: mocks.getTestnet,
  getHomeserver: () => 'homeservertestpubky',
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
  return {
    LocksOptions,
    ConnectUrlOptions,
    ExchangeFrontendSessionCodeOptions,
    SetLockServicePointerOptions,
    RegisterGuardedResourceOptions,
    CreateContentLockRequestBuilder,
    Locks: {
      forServerWithOptions: mocks.forServerWithOptions,
    },
  };
});

describe('LocksService (auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateConnectUrl builds a client from network config and returns the /connect URL with delivery=postmessage', async () => {
    const url = await LocksService.generateConnectUrl({
      lockServerPubky: 'lockserverpubky',
      returnTo: 'https://staging.pubky.app',
      state: 'opaque-state',
    });

    expect(url).toBe('https://connect.url/?delivery=postmessage');
    expect(mocks.forServerWithOptions).toHaveBeenCalledWith('lockserverpubky', expect.anything());
    expect(mocks.addPkarrRelay).toHaveBeenCalledWith('https://pkarr.example/inbox');
    expect(mocks.setLocalTestnetHomeserver).toHaveBeenCalledWith('homeservertestpubky'); // testnet=true
    expect(mocks.fakeLocks.createConnectUrl).toHaveBeenCalledWith(
      expect.objectContaining({ return_to: 'https://staging.pubky.app', state: 'opaque-state' }),
    );
  });

  it('does not set a testnet homeserver on mainnet (testnet=false)', async () => {
    mocks.getTestnet.mockReturnValueOnce(false);
    await LocksService.generateConnectUrl({
      lockServerPubky: 'lockserverpubky',
      returnTo: 'https://staging.pubky.app',
      state: 'opaque-state',
    });
    expect(mocks.setLocalTestnetHomeserver).not.toHaveBeenCalled();
    expect(mocks.addPkarrRelay).toHaveBeenCalledWith('https://pkarr.example/inbox'); // relays still set
  });

  it('exchangeSessionCode returns the session and freshly exported secret', async () => {
    const result = await LocksService.exchangeSessionCode({
      lockServerPubky: 'lockserverpubky',
      code: 'CODE',
      state: 'STATE',
    });
    expect(result).toEqual({ session: mocks.fakeSession, secret: 'secret-abc' });
    expect(mocks.fakeLocks.exchangeFrontendSessionCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CODE', state: 'STATE' }),
    );
  });

  it('restoreSession rebuilds a session from a persisted secret', async () => {
    const session = await LocksService.restoreSession({ lockServerPubky: 'lockserverpubky', secret: 'secret-abc' });
    expect(session).toBe(mocks.fakeSession);
    expect(mocks.fakeLocks.restoreSession).toHaveBeenCalledWith('secret-abc');
  });

  it('signout delegates to the session', async () => {
    await LocksService.signout(mocks.fakeSession as never);
    expect(mocks.fakeSession.signout).toHaveBeenCalled();
  });

  it('setLockServiceConfig writes the pointer through the session creator with the default lock server', async () => {
    await LocksService.setLockServiceConfig(mocks.fakeSession as never, 'lockserverpubky');
    expect(mocks.setLockServicePointer).toHaveBeenCalledWith(
      expect.objectContaining({ default_lock_server: 'lockserverpubky' }),
    );
  });

  it('maps a failed lock-service-config write to an AppError under the Locks service', async () => {
    mocks.setLockServicePointer.mockRejectedValueOnce(new Error('creator authority unavailable'));
    const error = await LocksService.setLockServiceConfig(mocks.fakeSession as never, 'lockserverpubky').catch(
      (e: unknown) => e,
    );
    expect(isAppError(error)).toBe(true);
  });

  it('maps SDK failures to an AppError under the Locks service', async () => {
    mocks.fakeLocks.createConnectUrl.mockRejectedValueOnce(new Error('pkarr resolve failed'));
    const error = await LocksService.generateConnectUrl({
      lockServerPubky: 'lockserverpubky',
      returnTo: 'https://staging.pubky.app/locks/callback',
      state: 'opaque-state',
    }).catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
  });
});

const session = asOpaque<LocksSdkSession>({
  creator: { registerGuardedResource: mocks.registerGuardedResource, createContentLock: mocks.createContentLock },
});

const descriptor = { path: '/priv/locks.app/content/id-1', hash: 'H', content_type: 'image/png', size: 1 };

const lockParams = {
  session,
  primaryResource: descriptor,
  criteria: [],
  lockLogic: { type: 'all', criteria: [] },
  accessPolicy: { requested_credential_ttl_seconds: 900 },
  lockServer: { override: 'lockpubky' },
};

describe('LocksService (content)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registerGuardedResource returns the descriptor and the owner pubky', async () => {
    mocks.registerGuardedResource.mockResolvedValue({ guarded_resource: descriptor, creator: 'pubkybob' });

    const result = await LocksService.registerGuardedResource({
      session,
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

  // The SDK exposes no status field — an HTTP 401 only shows up in the message.
  it.each([
    [
      'registerGuardedResource',
      () =>
        LocksService.registerGuardedResource({
          session,
          path: 'id-1',
          contentType: 'image/png',
          bytes: new Uint8Array([1]),
        }),
      mocks.registerGuardedResource,
    ],
    ['createContentLock', () => LocksService.createContentLock(lockParams), mocks.createContentLock],
  ])('%s promotes an HTTP 401 to an auth error', async (_name, call, mock) => {
    mock.mockRejectedValue(new Error('Lock Server request failed with HTTP 401'));

    const error = await call().catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
  });

  it('leaves other HTTP failures as non-auth errors', async () => {
    mocks.createContentLock.mockRejectedValue(new Error('Lock Server request failed with HTTP 422'));

    const error = await LocksService.createContentLock(lockParams).catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).not.toBe(ErrorCategory.Auth);
  });

  it('leaves a network failure as a non-auth error', async () => {
    mocks.registerGuardedResource.mockRejectedValue(
      new Error('Lock Server request failed: TypeError: Failed to fetch'),
    );

    const error = await LocksService.registerGuardedResource({
      session,
      path: 'id-1',
      contentType: 'image/png',
      bytes: new Uint8Array([1]),
    }).catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).not.toBe(ErrorCategory.Auth);
  });
});
