import { webcrypto } from 'node:crypto';
import type { GrantAuthFlow, Pubky, Session } from '@synonymdev/pubky';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CAPABILITIES } from '@/config/auth';
import { asOpaque } from '@/test-utils/type-assertions';
import { createTestWebLocks } from '@/test-utils/web-locks';
import type { GrantFlowRequest, GrantFlowService } from './grant-flow';
import type { PendingGrantRecord } from './pending-grant-store';

const approval = vi.hoisted(() => ({ reject: (_error: unknown) => {} }));

vi.mock('@/config/network', async (original) => ({
  ...(await original<typeof import('@/config/network')>()),
  getHomeserver: () => '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y',
}));
vi.mock('./homeserver.utils', () => ({
  createCancelableAuthApproval: () => ({
    awaitApproval: new Promise<Session>((_resolve, reject) => {
      approval.reject = reject;
    }),
    cancel: vi.fn(),
  }),
}));
vi.mock('@/libs/observability/sentry', () => ({ captureAppError: vi.fn() }));
vi.mock('@/libs/logger/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn() } }));

const request: GrantFlowRequest = { purpose: 'signin', capabilities: APP_CAPABILITIES, generation: 'same-account' };
const services: (typeof GrantFlowService)[] = [];

function makeSdk() {
  let sequence = 0;
  const makeFlow = () => {
    const id = ++sequence;
    return asOpaque<GrantAuthFlow>({
      authorizationUrl: `pubkyauth://grant-${id}`,
      free: vi.fn(),
      saveDelegated: vi.fn(() => `delegated-state-${id}`),
    });
  };
  return asOpaque<Pubky>({
    startGrantAuthFlow: vi.fn(async () => makeFlow()),
    resumeDelegatedGrantAuthFlow: vi.fn(async () => makeFlow()),
  });
}

/**
 * A killed page loses JS state, sessionStorage, and its Web Locks. IndexedDB and
 * localStorage remain. The separate real-SDK contract verifies the relay/PoP result.
 */
async function nextPage() {
  sessionStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
  vi.resetModules();
  const { GrantFlowService: service } = await import('./grant-flow');
  services.push(service);
  return service;
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const service of services.splice(0)) service.clear();
  // Let queued cleanup open its database before replacing the test's IDB factory.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('pending grant cleanup across page lifecycles', () => {
  it('does not recover an explicitly canceled attempt after its approval failed', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    const flow = await firstPage.start(sdk, request);
    const failed = expect(flow.awaitApproval).rejects.toThrow('Relay unavailable');
    approval.reject(new Error('Relay unavailable'));
    await failed;
    firstPage.clear();

    const reopened = await nextPage();
    await reopened.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });

  it('does not recover an explicitly canceled attempt after a transient resume failure', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    await firstPage.start(sdk, request);
    const reopened = await nextPage();
    vi.mocked(sdk.resumeDelegatedGrantAuthFlow).mockRejectedValueOnce(
      Object.assign(new Error('IndexedDB could not be opened'), { name: 'ClientStateError' }),
    );
    await expect(reopened.start(sdk, request)).rejects.toMatchObject({ name: 'ClientStateError' });
    reopened.clear();

    const finalPage = await nextPage();
    await finalPage.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
    expect(sdk.resumeDelegatedGrantAuthFlow).toHaveBeenCalledTimes(1);
  });

  it('does not revive an orphan superseded by a fresh attempt after that new attempt is canceled', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    await firstPage.start(sdk, request);
    const reopened = await nextPage();
    const fresh = await reopened.start(sdk, { ...request, fresh: true });
    fresh.cancelAuthFlow();

    const finalPage = await nextPage();
    await finalPage.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(3);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });

  it('starts a new flow when a copied tab hint points to an explicitly canceled attempt', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    const original = await firstPage.start(sdk, request);
    const copiedHint = sessionStorage.getItem('pubky-app-pending-grant-v1');
    expect(copiedHint).not.toBeNull();
    original.cancelAuthFlow();
    const duplicate = await nextPage();
    sessionStorage.setItem('pubky-app-pending-grant-v1', copiedHint!);

    await expect(duplicate.start(sdk, request)).resolves.toHaveProperty('authorizationUrl');

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });

  it('releases a candidate claimed after the requesting page canceled its start', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    await firstPage.start(sdk, request);
    const reopened = await nextPage();
    const { PendingGrantStore } = await import('./pending-grant-store');
    const claim = PendingGrantStore.claim;
    let acquired = false;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const claimSpy = vi.spyOn(PendingGrantStore, 'claim').mockImplementationOnce(async (id) => {
      const lease = await claim.call(PendingGrantStore, id);
      acquired = true;
      await delayed;
      return lease;
    });
    const starting = reopened.start(sdk, request);
    const canceled = expect(starting).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    await vi.waitFor(() => expect(acquired).toBe(true));
    reopened.clear();
    release();
    await canceled;
    claimSpy.mockRestore();

    await reopened.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
    expect(sdk.resumeDelegatedGrantAuthFlow).toHaveBeenCalledOnce();
  });

  it('invalidates durable recovery even when the canceled tab hint cannot be removed', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    const flow = await firstPage.start(sdk, request);
    const removeItem = Storage.prototype.removeItem;
    const hintFailure = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === 'pubky-app-pending-grant-v1') throw new DOMException('Storage unavailable', 'SecurityError');
      return removeItem.call(this, key);
    });
    try {
      flow.cancelAuthFlow();
    } catch {
      // Regardless of how the UI reports a blocked tab store, cancellation must invalidate durable recovery.
    }
    hintFailure.mockRestore();
    const reopened = await nextPage();
    await reopened.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });

  it('keeps cancellation ownership while a same-context retry discovers its pending record', async () => {
    const page = await nextPage();
    const sdk = makeSdk();
    await page.start(sdk, request);
    const { PendingGrantStore } = await import('./pending-grant-store');
    const getCandidates = PendingGrantStore.getCandidates;
    let discovering = false;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const candidatesSpy = vi.spyOn(PendingGrantStore, 'getCandidates').mockImplementationOnce(async (...args) => {
      discovering = true;
      await delayed;
      return getCandidates.call(PendingGrantStore, ...args);
    });
    const retrying = page.start(sdk, request);
    const canceled = expect(retrying).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    await vi.waitFor(() => expect(discovering).toBe(true));
    page.clear();
    release();
    await canceled;
    candidatesSpy.mockRestore();

    const reopened = await nextPage();
    await reopened.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });

  it.each(['cancelAuthFlow', 'completeAuthFlow'] as const)(
    'ignores an old %s callback while a same-context retry discovers its record',
    async (callback) => {
      const page = await nextPage();
      const sdk = makeSdk();
      const original = await page.start(sdk, request);
      const { PendingGrantStore } = await import('./pending-grant-store');
      const getCandidates = PendingGrantStore.getCandidates;
      let discovering = false;
      let release!: () => void;
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const candidatesSpy = vi.spyOn(PendingGrantStore, 'getCandidates').mockImplementationOnce(async (...args) => {
        discovering = true;
        await delayed;
        return getCandidates.call(PendingGrantStore, ...args);
      });
      const retrying = page.start(sdk, request);
      await vi.waitFor(() => expect(discovering).toBe(true));
      original[callback]?.();
      release();
      await retrying;
      candidatesSpy.mockRestore();

      expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
      expect(sdk.resumeDelegatedGrantAuthFlow).toHaveBeenCalledOnce();
      const reopened = await nextPage();
      await reopened.start(sdk, request);
      expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
      expect(sdk.resumeDelegatedGrantAuthFlow).toHaveBeenCalledTimes(2);
    },
  );

  it('retires the owned sign-in before a different purpose even after its tab hint is lost', async () => {
    const page = await nextPage();
    const sdk = makeSdk();
    await page.start(sdk, request);
    sessionStorage.clear();
    const upgrade = await page.start(sdk, { ...request, purpose: 'upgrade' });
    upgrade.cancelAuthFlow();

    const reopened = await nextPage();
    await reopened.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(3);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });

  it('does not release a lease transferred to a newer retry when an older SDK resume finishes', async () => {
    const page = await nextPage();
    const sdk = makeSdk();
    await page.start(sdk, request);
    const saved: { id: string } = JSON.parse(sessionStorage.getItem('pubky-app-pending-grant-v1')!);
    const { PendingGrantStore } = await import('./pending-grant-store');
    const resume = vi.mocked(sdk.resumeDelegatedGrantAuthFlow);
    const resumeImplementation = resume.getMockImplementation()!;
    let resuming = false;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    resume.mockImplementationOnce(async (...args) => {
      const flow = await resumeImplementation(...args);
      resuming = true;
      await delayed;
      return flow;
    });
    const older = page.start(sdk, request);
    const canceled = expect(older).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    await vi.waitFor(() => expect(resuming).toBe(true));
    const current = await page.start(sdk, request);
    release();
    await canceled;

    const conflicting = await PendingGrantStore.claim(saved.id);
    try {
      expect(conflicting).toBeNull();
      expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
      expect(sdk.resumeDelegatedGrantAuthFlow).toHaveBeenCalledTimes(2);
    } finally {
      conflicting?.release();
      current.cancelAuthFlow();
    }
  });

  it('keeps its active attempt ahead of a newer orphan when the tab hint is lost', async () => {
    const page = await nextPage();
    const sdk = makeSdk();
    await page.start(sdk, request);
    const saved: PendingGrantRecord = JSON.parse(sessionStorage.getItem('pubky-app-pending-grant-v1')!);
    const { PendingGrantStore } = await import('./pending-grant-store');
    const now = saved.createdAt + 1_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const orphan = { ...saved, id: crypto.randomUUID(), createdAt: now, saved: 'newer-orphan-serialization' };
    const orphanLease = await PendingGrantStore.claim(orphan.id);
    expect(orphanLease).not.toBeNull();
    await orphanLease!.save(orphan);
    orphanLease!.release();
    sessionStorage.clear();

    const resumed = await page.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
    expect(sdk.resumeDelegatedGrantAuthFlow).toHaveBeenCalledExactlyOnceWith(saved.saved);
    expect(JSON.parse(sessionStorage.getItem('pubky-app-pending-grant-v1')!).id).toBe(saved.id);
    const conflicting = await PendingGrantStore.claim(saved.id);
    try {
      expect(conflicting).toBeNull();
    } finally {
      conflicting?.release();
      resumed.cancelAuthFlow();
    }
  });

  it('retries failed orphan cleanup before exposing a fresh link', async () => {
    const firstPage = await nextPage();
    const sdk = makeSdk();
    await firstPage.start(sdk, request);
    const reopened = await nextPage();
    const setItem = Storage.prototype.setItem;
    const markerFailure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.startsWith('pubky-app-rejected-grant-v1:')) throw new DOMException('Full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    });
    const deleteFailure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'UnknownError');
    });
    await expect(reopened.start(sdk, { ...request, fresh: true })).rejects.toThrow();
    expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
    markerFailure.mockRestore();
    deleteFailure.mockRestore();

    const fresh = await reopened.start(sdk, { ...request, fresh: true });
    fresh.cancelAuthFlow();
    const finalPage = await nextPage();
    await finalPage.start(sdk, request);

    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(3);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });
});
