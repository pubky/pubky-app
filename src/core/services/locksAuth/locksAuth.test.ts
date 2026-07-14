import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppError } from '@/libs/error/error.utils';
import { LocksAuthService } from './locksAuth';

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
  return {
    LocksOptions,
    ConnectUrlOptions,
    ExchangeFrontendSessionCodeOptions,
    SetLockServicePointerOptions,
    Locks: {
      forServerWithOptions: mocks.forServerWithOptions,
    },
  };
});

describe('LocksAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateConnectUrl builds a client from network config and returns the /connect URL with delivery=postmessage', async () => {
    const url = await LocksAuthService.generateConnectUrl({
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
    await LocksAuthService.generateConnectUrl({
      lockServerPubky: 'lockserverpubky',
      returnTo: 'https://staging.pubky.app',
      state: 'opaque-state',
    });
    expect(mocks.setLocalTestnetHomeserver).not.toHaveBeenCalled();
    expect(mocks.addPkarrRelay).toHaveBeenCalledWith('https://pkarr.example/inbox'); // relays still set
  });

  it('exchangeSessionCode returns the session and freshly exported secret', async () => {
    const result = await LocksAuthService.exchangeSessionCode({
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
    const session = await LocksAuthService.restoreSession({ lockServerPubky: 'lockserverpubky', secret: 'secret-abc' });
    expect(session).toBe(mocks.fakeSession);
    expect(mocks.fakeLocks.restoreSession).toHaveBeenCalledWith('secret-abc');
  });

  it('signout delegates to the session', async () => {
    await LocksAuthService.signout(mocks.fakeSession as never);
    expect(mocks.fakeSession.signout).toHaveBeenCalled();
  });

  it('setLockServiceConfig writes the pointer through the session creator with the default lock server', async () => {
    await LocksAuthService.setLockServiceConfig(mocks.fakeSession as never, 'lockserverpubky');
    expect(mocks.setLockServicePointer).toHaveBeenCalledWith(
      expect.objectContaining({ default_lock_server: 'lockserverpubky' }),
    );
  });

  it('maps a failed lock-service-config write to an AppError under the Locks service', async () => {
    mocks.setLockServicePointer.mockRejectedValueOnce(new Error('creator authority unavailable'));
    const error = await LocksAuthService.setLockServiceConfig(mocks.fakeSession as never, 'lockserverpubky').catch(
      (e: unknown) => e,
    );
    expect(isAppError(error)).toBe(true);
  });

  it('maps SDK failures to an AppError under the Locks service', async () => {
    mocks.fakeLocks.createConnectUrl.mockRejectedValueOnce(new Error('pkarr resolve failed'));
    const error = await LocksAuthService.generateConnectUrl({
      lockServerPubky: 'lockserverpubky',
      returnTo: 'https://staging.pubky.app/locks/callback',
      state: 'opaque-state',
    }).catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
  });
});
