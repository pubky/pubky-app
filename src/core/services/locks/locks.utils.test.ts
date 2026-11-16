import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import {
  ensureLocksSdkReady,
  getLockServerPubky,
  getLockSession,
  getLocksReads,
  getPaykitServerOrigin,
  initLockClient,
  isLockServerRegionBlocked,
  toLocksError,
  withLocksTimeout,
} from './locks.utils';

const mocks = vi.hoisted(() => ({
  addPkarrRelay: vi.fn(),
  setLocalTestnetHomeserver: vi.fn(),
  forServerWithOptions: vi.fn(() => ({ viewer: {} })),
  getTestnet: vi.fn(() => true),
  getLockServer: vi.fn((): string | undefined => 'lockserverpubky'),
  getPaykitServerUrl: vi.fn((): string | undefined => 'https://paykit.server'),
  getE2eLocksStubUrl: vi.fn((): string | undefined => undefined),
  createE2eLocksClient: vi.fn(() => ({ viewer: { id: 'e2e-viewer' } })),
  createE2eLocksReads: vi.fn(() => ({ id: 'e2e-reads' })),
  readContentLockWithOptions: vi.fn(async () => ({ version: 1 })),
  hasPaykitDataWithOptions: vi.fn(async () => true),
  init: vi.fn(async () => {}),
  session: null as unknown,
  creatorPubky: 'account' as string | null,
  currentUserPubky: 'account' as string | null,
}));

vi.mock('@/config/network', () => ({
  getPkarrRelays: () => ['https://pkarr.example/inbox', 'https://pkarr2.example/inbox'],
  getTestnet: mocks.getTestnet,
  getHomeserver: () => 'homeservertestpubky',
  getLockServer: mocks.getLockServer,
  getPaykitServerUrl: mocks.getPaykitServerUrl,
  getE2eLocksStubUrl: mocks.getE2eLocksStubUrl,
}));

vi.mock('./locks.e2eStub', () => ({
  createE2eLocksClient: mocks.createE2eLocksClient,
  createE2eLocksReads: mocks.createE2eLocksReads,
}));

vi.mock('@synonymdev/locks-sdk', () => {
  class LocksOptions {
    addPkarrRelay = mocks.addPkarrRelay;
    setLocalTestnetHomeserver = mocks.setLocalTestnetHomeserver;
  }
  return {
    default: mocks.init, // the real web-build SDK default-exports its wasm init()
    LocksOptions,
    Locks: {
      forServerWithOptions: mocks.forServerWithOptions,
      readContentLockWithOptions: mocks.readContentLockWithOptions,
      hasPaykitDataWithOptions: mocks.hasPaykitDataWithOptions,
    },
  };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: { getState: () => ({ currentUserPubky: mocks.currentUserPubky }) },
}));

vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({ selectLocksSession: () => mocks.session, selectLocksCreatorPubky: () => mocks.creatorPubky }),
  },
}));

/** A fresh module with the stub URL set, after `ensureLocksSdkReady` has loaded the stub. */
const freshUtilsWithE2eStub = async () => {
  mocks.getE2eLocksStubUrl.mockReturnValue('http://lock-server.e2e.test');
  vi.resetModules();
  const utils = await import('./locks.utils');
  await utils.ensureLocksSdkReady();
  return utils;
};

describe('locks.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getE2eLocksStubUrl.mockReturnValue(undefined);
    mocks.getTestnet.mockReturnValue(true);
    mocks.getLockServer.mockReturnValue('lockserverpubky');
    mocks.session = null;
    mocks.creatorPubky = 'account';
    mocks.currentUserPubky = 'account';
  });

  describe('isLockServerRegionBlocked', () => {
    const sdkError = (message: string) => Object.assign(new Error(message), { name: 'InvalidInput' });

    it('is true for the pinned SDK InvalidInput Error with the exact HTTP 451 message', () => {
      expect(isLockServerRegionBlocked(sdkError('Lock Server viewer request failed with HTTP 451'))).toBe(true);
    });

    it('is false for other statuses, other failures and anything that is not a raw SDK failure', () => {
      expect(isLockServerRegionBlocked(sdkError('Lock Server viewer request failed with HTTP 429'))).toBe(false);
      expect(isLockServerRegionBlocked(sdkError('Lock Server viewer request failed with HTTP 4510'))).toBe(false);
      expect(isLockServerRegionBlocked(sdkError('failed to parse JSON response: HTTP 451'))).toBe(false);
      expect(isLockServerRegionBlocked(sdkError('Lock Server viewer request failed with HTTP 451\n'))).toBe(false);
      expect(isLockServerRegionBlocked(new Error('Lock Server viewer request failed with HTTP 451'))).toBe(false);
      expect(isLockServerRegionBlocked('Lock Server viewer request failed with HTTP 451')).toBe(false);
      expect(
        isLockServerRegionBlocked({ name: 'InvalidInput', message: 'Lock Server viewer request failed with HTTP 451' }),
      ).toBe(false);
      expect(isLockServerRegionBlocked(new Error('network down'))).toBe(false);
      expect(isLockServerRegionBlocked(undefined)).toBe(false);
    });

    it('is false for an AppError, which was already reported at its origin', () => {
      const reported = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Lock Server viewer request failed with HTTP 451',
        {
          service: ErrorService.Locks,
          operation: 'op',
        },
      );
      reported.name = 'InvalidInput';
      expect(isLockServerRegionBlocked(reported)).toBe(false);
    });
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

  describe('withLocksTimeout', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('passes the request rejection through unchanged and clears its timer', async () => {
      vi.useFakeTimers();
      const failure = new Error('network down');

      await expect(withLocksTimeout(Promise.reject(failure), 'op')).rejects.toBe(failure);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects with a Locks timeout once the given limit passes', async () => {
      vi.useFakeTimers();
      const outcome = withLocksTimeout(new Promise<never>(() => {}), 'op', { timeoutMs: 50 }).catch(
        (caught: unknown) => caught,
      );

      await vi.advanceTimersByTimeAsync(50);

      expect(await outcome).toMatchObject({
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        service: ErrorService.Locks,
        operation: 'op',
        context: { timeoutMs: 50 },
      });
    });

    it('undoes a write that lands after the timeout, and only then', async () => {
      vi.useFakeTimers();
      const undoLateWrite = vi.fn(async () => {});
      const late = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 80));
      await withLocksTimeout(Promise.resolve('on time'), 'op', { timeoutMs: 50, undoLateWrite });
      const timedOut = withLocksTimeout(late, 'op', { timeoutMs: 50, undoLateWrite }).catch(() => undefined);

      await vi.advanceTimersByTimeAsync(50);
      await timedOut;
      expect(undoLateWrite).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(30);

      expect(undoLateWrite).toHaveBeenCalledExactlyOnceWith('late');
    });

    it('drops a request that fails after the timeout, with no undo and no second report', async () => {
      vi.useFakeTimers();
      const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      const undoLateWrite = vi.fn(async () => {});
      const late = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('network down')), 80));
      const outcome = withLocksTimeout(late, 'op', { timeoutMs: 50, undoLateWrite }).catch((caught: unknown) => caught);

      await vi.advanceTimersByTimeAsync(50);
      expect(await outcome).toMatchObject({ code: TimeoutErrorCode.REQUEST_TIMEOUT });
      const reportsAtTimeout = logError.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30);

      expect(logError).toHaveBeenCalledTimes(reportsAtTimeout);
      expect(undoLateWrite).not.toHaveBeenCalled();
    });

    it('reports an undo that fails', async () => {
      vi.useFakeTimers();
      const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      const late = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 80));
      const undoLateWrite = vi.fn(async () => {
        throw new Error('Lock Server request failed with HTTP 401');
      });
      const timedOut = withLocksTimeout(late, 'op', { timeoutMs: 50, undoLateWrite }).catch(() => undefined);

      await vi.advanceTimersByTimeAsync(80);
      await timedOut;

      expect(logError).toHaveBeenLastCalledWith(
        expect.stringContaining('op'),
        'Lock Server request failed with HTTP 401',
        { undoLateWrite: true },
      );
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
    // A session rebuilt by `restoreSession` has no creator pubky (#2856).
    it('returns the live session from the store when the stored creator is the app account', () => {
      const session = { id: 'session-1', creatorPubky: () => undefined };
      mocks.session = session;
      expect(getLockSession()).toBe(session);
    });

    it.each([null, 'different-account'])('rejects the old Locks identity for app account %s', (pubky) => {
      mocks.currentUserPubky = pubky;
      mocks.session = { id: 'session-1' };
      expect(() => getLockSession()).toThrow(expect.objectContaining({ category: ErrorCategory.Auth }));
    });

    it.each([null, 'account'])('rejects a session without a stored creator for app account %s', (pubky) => {
      mocks.currentUserPubky = pubky;
      mocks.creatorPubky = null;
      mocks.session = { id: 'session-1' };
      expect(() => getLockSession()).toThrow(expect.objectContaining({ category: ErrorCategory.Auth }));
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

    it('builds the E2E stub instead of the SDK client only when the stub URL is configured', async () => {
      const utils = await freshUtilsWithE2eStub();

      const client = utils.initLockClient();

      expect(mocks.createE2eLocksClient).toHaveBeenCalledWith('http://lock-server.e2e.test');
      expect(mocks.forServerWithOptions).not.toHaveBeenCalled();
      expect(client).toBe(mocks.createE2eLocksClient.mock.results[0]?.value);
    });
  });

  describe('getLocksReads', () => {
    it('reads through the SDK statics with the configured relays', async () => {
      const reads = getLocksReads();

      await expect(reads.readContentLock('creator/pub/app.locks/lock.json')).resolves.toEqual({ version: 1 });
      await expect(reads.hasPaykitData('reader')).resolves.toBe(true);
      expect(mocks.readContentLockWithOptions).toHaveBeenCalledWith(
        'creator/pub/app.locks/lock.json',
        expect.anything(),
      );
      expect(mocks.hasPaykitDataWithOptions).toHaveBeenCalledWith('reader', expect.anything());
      expect(mocks.addPkarrRelay).toHaveBeenCalledTimes(4);
      expect(mocks.createE2eLocksReads).not.toHaveBeenCalled();
    });

    it('returns the E2E stub reads only when the stub URL is configured', async () => {
      const utils = await freshUtilsWithE2eStub();

      const reads = utils.getLocksReads();

      expect(mocks.createE2eLocksReads).toHaveBeenCalledWith('http://lock-server.e2e.test');
      expect(reads).toBe(mocks.createE2eLocksReads.mock.results[0]?.value);
      expect(mocks.readContentLockWithOptions).not.toHaveBeenCalled();
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

    it('refuses the E2E stub before ensureLocksSdkReady has loaded it', async () => {
      mocks.getE2eLocksStubUrl.mockReturnValue('http://lock-server.e2e.test');
      vi.resetModules();
      const utils = await import('./locks.utils');

      expect(() => utils.initLockClient()).toThrow('E2E Locks stub used before ensureLocksSdkReady');
      expect(() => utils.getLocksReads()).toThrow('E2E Locks stub used before ensureLocksSdkReady');
      expect(mocks.createE2eLocksClient).not.toHaveBeenCalled();
      expect(mocks.forServerWithOptions).not.toHaveBeenCalled();
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
