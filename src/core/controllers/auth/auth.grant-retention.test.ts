import { webcrypto } from 'node:crypto';
import { type GrantAuthFlow, Pubky, type Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { getAuthClientId } from '@/config/auth';
import { HOMESERVER_CAPABILITIES } from '@/config/network';
import type { SessionReference } from '@/libs/auth/session.types';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

vi.mock('@/database/franky/franky.helpers', () => ({ clearDatabase: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/coordinators/notifications/notifications', () => ({ NotificationCoordinator: { resetInstance: vi.fn() } }));
vi.mock('@/coordinators/streams/stream', () => ({ StreamCoordinator: { resetInstance: vi.fn() } }));

const PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const PENDING_KEY = 'pubky-pending-grant-v1';
const retainedWarning =
  'Grant approval was canceled or superseded; the completed session was retained in SDK storage. Remote revocation was not confirmed.';
const failedWarning =
  'Grant approval was canceled or superseded; saving the completed session failed. Remote revocation was not confirmed.';
const reference = (id: string): SessionReference => ({
  kind: 'grant',
  sessionStoreId: id,
  clientId: getAuthClientId(),
  grantId: id,
  grantExpiresAt: 2_000_000_000,
  tokenExpiresAt: 1_900_000_000,
});
const session = (id: string) =>
  asOpaque<Session>({
    info: { publicKey: { z32: () => PUBKY }, capabilities: HOMESERVER_CAPABILITIES.split(',') },
    grant: { sessionInfo: vi.fn().mockResolvedValue(reference(id)) },
    signout: vi.fn(),
    export: vi.fn(),
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const active = session('active');
const candidate = session('candidate');
const records = new Map<string, Session>();
const sdk = asOpaque<Pubky>({
  startGrantAuthFlow: vi.fn(),
  browserSessionStore: {
    isAvailable: vi.fn().mockResolvedValue(true),
    save: vi.fn(),
    remove: vi.fn(),
    clearAll: vi.fn(),
    list: vi.fn(),
  },
});
const polls: ReturnType<typeof deferred<Session | undefined>>[] = [];
function nextFlow() {
  const poll = deferred<Session | undefined>();
  polls.push(poll);
  const flow = asOpaque<GrantAuthFlow>({
    authorizationUrl: 'pubkyauth://grant',
    tryPollOnce: vi.fn().mockReturnValue(poll.promise),
    free: vi.fn(),
    saveDelegated: vi.fn(() => 'sensitive-pending-serialization'),
  });
  vi.mocked(sdk.startGrantAuthFlow).mockResolvedValueOnce(flow);
  return { poll, flow };
}
function expectPreserved() {
  expect(useAuthStore.getState().session).toBe(active);
  expect(AuthApplication.readPersistedAuth()?.sessionReference).toEqual(reference('active'));
  expect(records.get('active')).toBe(active);
  expect(active.signout).not.toHaveBeenCalled();
  expect(candidate.signout).not.toHaveBeenCalled();
  expect(candidate.export).not.toHaveBeenCalled();
  expect(sdk.browserSessionStore.remove).not.toHaveBeenCalled();
  expect(sdk.browserSessionStore.clearAll).not.toHaveBeenCalled();
}
function expectRetained() {
  expect(sdk.browserSessionStore.save).toHaveBeenCalledExactlyOnceWith(candidate);
  expect(records.get('candidate')).toBe(candidate);
  expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(retainedWarning);
}
function failReferenceReads() {
  const read = Storage.prototype.getItem;
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (this === localStorage && key === AUTH_PERSIST_KEY) {
      throw new DOMException('Temporary localStorage read failure', 'UnknownError');
    }
    return read.call(this, key);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => void) => callback() },
  });
  localStorage.clear();
  sessionStorage.clear();
  AuthController.cancelActiveAuthFlow();
  const state = {
    generation: '',
    currentUserPubky: PUBKY,
    sessionReference: reference('active'),
    retiringSession: null,
    hasProfile: true,
  };
  useAuthStore.setState({ ...authInitialState, ...state, session: active, hasHydrated: true, restoreStatus: 'ready' });
  localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state }));
  records.clear();
  records.set('active', active);
  vi.spyOn(Pubky, 'testnet').mockReturnValue(sdk);
  vi.mocked(sdk.startGrantAuthFlow).mockReset();
  vi.mocked(sdk.browserSessionStore.save)
    .mockReset()
    .mockImplementation(async (saved) => {
      records.set('candidate', saved);
      return asOpaque({ id: 'candidate', storageMode: 'delegated' });
    });
  vi.mocked(sdk.browserSessionStore.list)
    .mockReset()
    .mockImplementation(async () => Array.from(records.keys(), (id) => asOpaque({ id, storageMode: 'delegated' })));
  vi.spyOn(AuthApplication, 'assertUserHomeserverAllowed').mockResolvedValue(undefined);
  vi.spyOn(Logger, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  AuthController.cancelActiveAuthFlow();
  for (const poll of polls.splice(0)) poll.resolve(undefined);
  await Promise.resolve();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('completed grant retention', () => {
  it.each(['refresh', 'cancel'] as const)(
    'retains an approval superseded during its homeserver check by %s',
    async (action) => {
      const check = deferred<void>();
      vi.mocked(AuthApplication.assertUserHomeserverAllowed).mockReturnValueOnce(check.promise);
      const old = nextFlow();
      const result = await AuthController.getAuthUrl();
      old.poll.resolve(candidate);
      await vi.waitFor(() => expect(AuthApplication.assertUserHomeserverAllowed).toHaveBeenCalledOnce());
      if (action === 'refresh') {
        nextFlow();
        await AuthController.getAuthUrl(true);
      } else result.cancelAuthFlow();
      const pending = sessionStorage.getItem(PENDING_KEY);
      if (action === 'refresh') expect(pending).not.toBeNull();
      else expect(pending).toBeNull();
      check.resolve();
      await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
      expectRetained();
      expectPreserved();
      expect(sessionStorage.getItem(PENDING_KEY)).toBe(pending);
    },
  );

  it('retains a deferred Passport approval only once after a newer Ring flow starts', async () => {
    const old = nextFlow();
    const result = await AuthController.getPassportAuthUrl({ xCallback: { xSource: 'Pubky' } });
    old.poll.resolve(candidate);
    await result.awaitApproval;
    nextFlow();
    await AuthController.getAuthUrl();
    const pending = sessionStorage.getItem(PENDING_KEY);
    expect(pending).not.toBeNull();
    await expect(AuthController.initializeAuthenticatedSession({ session: candidate })).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
    await expect(AuthController.initializeAuthenticatedSession({ session: candidate })).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
    expectRetained();
    expectPreserved();
    expect(sessionStorage.getItem(PENDING_KEY)).toBe(pending);
  });

  it('retains an approval when a canceled homeserver check rejects', async () => {
    const check = deferred<void>();
    vi.mocked(AuthApplication.assertUserHomeserverAllowed).mockReturnValueOnce(check.promise);
    const old = nextFlow();
    const result = await AuthController.getAuthUrl();
    old.poll.resolve(candidate);
    await vi.waitFor(() => expect(AuthApplication.assertUserHomeserverAllowed).toHaveBeenCalledOnce());
    result.cancelAuthFlow();
    check.reject(new DOMException('Network unavailable', 'NetworkError'));
    await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expectRetained();
    expectPreserved();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('reuses the saved candidate when superseded while waiting for the reference lock', async () => {
    const lock = deferred<void>();
    const request = vi.fn(async (_name: string, callback: () => void) => {
      await lock.promise;
      callback();
    });
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    const old = nextFlow();
    const result = await AuthController.getAuthUrl();
    old.poll.resolve(candidate);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    nextFlow();
    await AuthController.getAuthUrl(true);
    const pending = sessionStorage.getItem(PENDING_KEY);
    lock.resolve();
    await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expectRetained();
    expectPreserved();
    expect(sessionStorage.getItem(PENDING_KEY)).toBe(pending);
  });

  it.each(['saved', 'failed'] as const)(
    'reuses a %s SDK persistence attempt when the generation changes during save',
    async (outcome) => {
      const save = deferred<Awaited<ReturnType<typeof sdk.browserSessionStore.save>>>();
      vi.mocked(sdk.browserSessionStore.save).mockReturnValueOnce(save.promise);
      const old = nextFlow();
      const result = await AuthController.getAuthUrl();
      old.poll.resolve(candidate);
      await vi.waitFor(() => expect(sdk.browserSessionStore.save).toHaveBeenCalledOnce());
      const state = { ...AuthApplication.readPersistedAuth(), generation: 'other-tab' };
      localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state }));
      if (outcome === 'saved') {
        records.set('candidate', candidate);
        save.resolve(asOpaque({ id: 'candidate', storageMode: 'delegated' }));
      } else save.reject(new DOMException('Storage unavailable', 'UnknownError'));
      await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
      expect(sdk.browserSessionStore.save).toHaveBeenCalledExactlyOnceWith(candidate);
      expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(outcome === 'saved' ? retainedWarning : failedWarning);
      expect(AuthApplication.readPersistedAuth()?.generation).toBe('other-tab');
      expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
      expectPreserved();
    },
  );

  it('reports failed retention without exposing the failed SDK payload or claiming success', async () => {
    const check = deferred<void>();
    vi.mocked(AuthApplication.assertUserHomeserverAllowed).mockReturnValueOnce(check.promise);
    const old = nextFlow();
    const result = await AuthController.getAuthUrl();
    old.poll.resolve(candidate);
    await vi.waitFor(() => expect(AuthApplication.assertUserHomeserverAllowed).toHaveBeenCalledOnce());
    result.cancelAuthFlow();
    vi.mocked(sdk.browserSessionStore.save).mockRejectedValueOnce({ secret: 'sensitive-pending-serialization' });
    check.resolve();
    await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(sdk.browserSessionStore.save).toHaveBeenCalledOnce();
    expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(failedWarning);
    expect(records.has('candidate')).toBe(false);
    expectPreserved();
  });

  it('quietly cancels an unapproved flow without saving or reporting a grant', async () => {
    const old = nextFlow();
    const result = await AuthController.getAuthUrl();
    result.cancelAuthFlow();
    await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(old.flow.tryPollOnce).not.toHaveBeenCalled();
    expect(sdk.browserSessionStore.save).not.toHaveBeenCalled();
    expect(Logger.warn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expectPreserved();
  });

  // This tests a returned-session boundary, not the real SDK's behavior after freeing its WASM flow.
  it('retains a synthetic session returned by an in-flight poll after cancellation', async () => {
    const old = nextFlow();
    const result = await AuthController.getAuthUrl();
    await vi.waitFor(() => expect(old.flow.tryPollOnce).toHaveBeenCalledOnce());
    nextFlow();
    await AuthController.getAuthUrl(true);
    const pending = sessionStorage.getItem(PENDING_KEY);
    old.poll.resolve(candidate);
    await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expectRetained();
    expectPreserved();
    expect(sessionStorage.getItem(PENDING_KEY)).toBe(pending);
    expect(AuthApplication.assertUserHomeserverAllowed).not.toHaveBeenCalled();
  });

  it.each(['sdk', 'reference'] as const)(
    'preserves resumable material after a transient %s persistence failure',
    async (stage) => {
      const old = nextFlow();
      const result = await AuthController.getAuthUrl();
      const pending = sessionStorage.getItem(PENDING_KEY);
      expect(pending).not.toBeNull();
      const failure = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Storage unavailable', {
        service: ErrorService.Local,
        operation: 'test',
      });
      if (stage === 'sdk') vi.mocked(sdk.browserSessionStore.save).mockRejectedValueOnce(failure);
      else vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValueOnce(failure);
      old.poll.resolve(candidate);
      await expect(result.awaitApproval).rejects.toBe(failure);
      expect(sessionStorage.getItem(PENDING_KEY)).toBe(pending);
      expect(Logger.warn).toHaveBeenCalledWith(stage === 'sdk' ? failedWarning : retainedWarning);
      expect(records.get('candidate')).toBe(stage === 'sdk' ? undefined : candidate);
      expect(sdk.browserSessionStore.save).toHaveBeenCalledOnce();
      expectPreserved();
    },
  );

  it.each(['before adoption', 'after SDK save', 'inside reference commit'] as const)(
    'preserves pending approval and surfaces a reference-read failure %s',
    async (stage) => {
      const old = nextFlow();
      const result = await AuthController.getAuthUrl();
      const pending = sessionStorage.getItem(PENDING_KEY);
      expect(pending).not.toBeNull();
      let readFailure: ReturnType<typeof failReferenceReads> | undefined;
      if (stage === 'before adoption') readFailure = failReferenceReads();
      else if (stage === 'after SDK save') {
        vi.mocked(sdk.browserSessionStore.save).mockImplementationOnce(async (saved) => {
          records.set('candidate', saved);
          readFailure = failReferenceReads();
          return asOpaque({ id: 'candidate', storageMode: 'delegated' });
        });
      } else {
        Object.defineProperty(navigator, 'locks', {
          configurable: true,
          value: {
            request: async (_name: string, callback: () => void) => {
              readFailure = failReferenceReads();
              callback();
            },
          },
        });
      }
      old.poll.resolve(candidate);
      await expect(result.awaitApproval).rejects.toMatchObject({
        name: 'AppError',
        code: DatabaseErrorCode.QUERY_FAILED,
        operation: 'readAuthReference',
      });
      expect(readFailure).toBeDefined();
      readFailure?.mockRestore();
      expect(sessionStorage.getItem(PENDING_KEY)).toBe(pending);
      expect(Logger.warn).not.toHaveBeenCalled();
      expect(sdk.browserSessionStore.save).toHaveBeenCalledTimes(stage === 'before adoption' ? 0 : 1);
      if (stage !== 'before adoption') expect(records.get('candidate')).toBe(candidate);
      expectPreserved();
    },
  );

  it('adopts a current approval once without a retention warning', async () => {
    // A resumed approval can describe the active grant; it needs no predecessor retirement.
    useAuthStore.setState({ sessionReference: reference('candidate') });
    const state = { ...AuthApplication.readPersistedAuth(), sessionReference: reference('candidate') };
    localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state }));
    const old = nextFlow();
    const result = await AuthController.getAuthUrl();
    old.poll.resolve(candidate);
    await expect(result.awaitApproval).resolves.toBe(candidate);
    expect(sdk.browserSessionStore.save).toHaveBeenCalledExactlyOnceWith(candidate);
    expect(useAuthStore.getState().session).toBe(candidate);
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toEqual(reference('candidate'));
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(Logger.warn).not.toHaveBeenCalled();
    expect(sdk.browserSessionStore.remove).not.toHaveBeenCalled();
    expect(active.signout).not.toHaveBeenCalled();
  });

  it('retains completed local-secret credentials after a transient recovery-login reference failure', async () => {
    vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(asOpaque({}));
    vi.spyOn(AuthApplication, 'signIn').mockResolvedValue({ session: candidate });
    const failure = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Storage unavailable', {
      service: ErrorService.Local,
      operation: 'test',
    });
    vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValueOnce(failure);
    vi.mocked(sdk.browserSessionStore.list).mockResolvedValueOnce([
      asOpaque({ id: 'candidate', storageMode: 'local' }),
    ]);
    await expect(AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' })).rejects.toBe(failure);
    expect(sdk.browserSessionStore.remove).not.toHaveBeenCalled();
    expect(records.get('candidate')).toBe(candidate);
    expect(useAuthStore.getState().session).toBe(active);
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toEqual(reference('active'));
    expect(active.signout).not.toHaveBeenCalled();
    expect(candidate.signout).not.toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(retainedWarning);
  });
});
