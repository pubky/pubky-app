import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import {
  ensureLocksSdkReady,
  getLockServerPubky,
  getLockSession,
  getPaykitServerOrigin,
  initLockClient,
  toLocksError,
} from './locks.utils';

const mocks = vi.hoisted(() => ({
  addPkarrRelay: vi.fn(),
  setLocalTestnetHomeserver: vi.fn(),
  forServerWithOptions: vi.fn(() => ({ viewer: {} })),
  getTestnet: vi.fn(() => true),
  getLockServer: vi.fn((): string | undefined => 'lockserverpubky'),
  getPaykitServerUrl: vi.fn((): string | undefined => 'https://paykit.server'),
  init: vi.fn(async () => {}),
  session: null as unknown,
}));

vi.mock('@/config/network', () => ({
  getPkarrRelays: () => ['https://pkarr.example/inbox', 'https://pkarr2.example/inbox'],
  getTestnet: mocks.getTestnet,
  getHomeserver: () => 'homeservertestpubky',
  getLockServer: mocks.getLockServer,
  getPaykitServerUrl: mocks.getPaykitServerUrl,
}));

vi.mock('@pubky/locks-sdk', () => {
  class LocksOptions {
    addPkarrRelay = mocks.addPkarrRelay;
    setLocalTestnetHomeserver = mocks.setLocalTestnetHomeserver;
  }
  return {
    default: mocks.init, // the real web-build SDK default-exports its wasm init()
    LocksOptions,
    Locks: { forServerWithOptions: mocks.forServerWithOptions },
  };
});

vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: { getState: () => ({ selectLocksSession: () => mocks.session }) },
}));

describe('locks.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTestnet.mockReturnValue(true);
    mocks.getLockServer.mockReturnValue('lockserverpubky');
    mocks.session = null;
  });

  describe('toLocksError', () => {
    it('promotes an HTTP 401 to a typed auth error (an expired session)', () => {
      const error = toLocksError(new Error('Lock Server request failed with HTTP 401'), 'op');
      expect(isAppError(error)).toBe(true);
      expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
    });

    it('maps any other failure to a generic Locks AppError, not an auth error', () => {
      const error = toLocksError(new Error('network down'), 'op');
      expect(isAppError(error)).toBe(true);
      expect((error as { category: ErrorCategory }).category).not.toBe(ErrorCategory.Auth);
    });

    it('returns an already-typed AppError unchanged', () => {
      const original = Err.validation(ValidationErrorCode.MISSING_FIELD, 'already typed', {
        service: ErrorService.Locks,
        operation: 'op',
      });
      expect(toLocksError(original, 'other-op')).toBe(original);
    });
  });

  describe('getLockServerPubky', () => {
    it('returns the runtime-configured Lock Server pubky', () => {
      expect(getLockServerPubky()).toBe('lockserverpubky');
    });

    it('throws a typed validation error when no Lock Server is configured (Locks disabled)', () => {
      mocks.getLockServer.mockReturnValue(undefined);
      let thrown: unknown;
      try {
        getLockServerPubky();
      } catch (error) {
        thrown = error;
      }
      expect(isAppError(thrown)).toBe(true);
      expect((thrown as { category: ErrorCategory }).category).toBe(ErrorCategory.Validation);
    });

    it('reports to Sentry exactly once — the service catch must not re-wrap and report again', async () => {
      const captureAppError = vi.fn();
      vi.doMock('@/libs/observability/sentry', () => ({ captureAppError }));
      vi.resetModules();
      // The import at the top of this file was resolved before the mock existed and still uses the
      // real `captureAppError`. Only a fresh import sees the mocked one.
      const locksUtils = await import('./locks.utils');
      mocks.getLockServer.mockReturnValue(undefined);

      let thrown: unknown;
      try {
        locksUtils.getLockServerPubky();
      } catch (error) {
        thrown = error;
      }

      expect(captureAppError).toHaveBeenCalledTimes(1);
      expect(locksUtils.toLocksError(thrown, 'LocksService.setLockServiceConfig')).toBe(thrown);
      expect(captureAppError).toHaveBeenCalledTimes(1);

      vi.doUnmock('@/libs/observability/sentry');
      vi.resetModules();
    });
  });

  describe('getLockSession', () => {
    it('returns the live session from the store', () => {
      const session = { id: 'session-1' };
      mocks.session = session;
      expect(getLockSession()).toBe(session);
    });

    it('throws a typed auth error when there is no session', () => {
      mocks.session = null;
      let caught: unknown;
      try {
        getLockSession();
      } catch (error) {
        caught = error;
      }
      expect(isAppError(caught)).toBe(true);
      expect((caught as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
    });
  });

  describe('initLockClient', () => {
    it('applies every pkarr relay, then builds the client for the configured server', () => {
      const client = initLockClient();

      expect(mocks.addPkarrRelay).toHaveBeenCalledTimes(2);
      expect(mocks.forServerWithOptions).toHaveBeenCalledWith('lockserverpubky', expect.anything());
      expect(client).toBe(mocks.forServerWithOptions.mock.results[0]?.value);
    });

    // The SDK falls back to this homeserver whenever creator pkarr resolution fails, which hides
    // resolution bugs on testnet until they reach a deployed environment.
    it('never sets the testnet homeserver fallback', () => {
      initLockClient();

      expect(mocks.setLocalTestnetHomeserver).not.toHaveBeenCalled();
    });
  });

  describe('ensureLocksSdkReady', () => {
    // The init promise is module state, so each test re-imports to start with an empty cache.
    const freshEnsureLocksSdkReady = async () => {
      vi.resetModules();
      return (await import('./locks.utils')).ensureLocksSdkReady;
    };

    it('resolves after running the SDK wasm init', async () => {
      await expect(ensureLocksSdkReady()).resolves.toBeUndefined();
      expect(mocks.init).toHaveBeenCalled();
    });

    it('runs the wasm init once, however many callers ask', async () => {
      const ensure = await freshEnsureLocksSdkReady();

      await Promise.all([ensure(), ensure(), ensure()]);

      expect(mocks.init).toHaveBeenCalledTimes(1);
    });

    it('retries on the next call after a failed init', async () => {
      const ensure = await freshEnsureLocksSdkReady();
      mocks.init.mockRejectedValueOnce(new Error('wasm boom'));

      await expect(ensure()).rejects.toThrow('wasm boom');
      // A cached rejection would leave Locks dead until a page reload.
      await expect(ensure()).resolves.toBeUndefined();
      expect(mocks.init).toHaveBeenCalledTimes(2);
    });
  });
});

describe('getPaykitServerOrigin', () => {
  it('keeps only the origin, so a configured path cannot leak into the setup URL', () => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server/some/path?a=1');
    expect(getPaykitServerOrigin()).toBe('https://paykit.server');
  });

  it('preserves a non-default port', () => {
    mocks.getPaykitServerUrl.mockReturnValue('http://localhost:3001');
    expect(getPaykitServerOrigin()).toBe('http://localhost:3001');
  });

  it('throws a validation error when no Paykit Server is configured', () => {
    mocks.getPaykitServerUrl.mockReturnValue(undefined);
    try {
      getPaykitServerOrigin();
      expect.unreachable('expected a validation error');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        category: ErrorCategory.Validation,
        code: ValidationErrorCode.MISSING_FIELD,
        service: ErrorService.Locks,
      });
    }
  });
});
