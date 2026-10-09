import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDatabase } from '@/database/franky/franky.helpers';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { mockGrantReference } from '@/test-utils/pubky';
import { LocalAuthService } from './auth';

vi.mock('@/database/franky/franky.helpers', () => ({ clearDatabase: vi.fn() }));

const record: PersistedAuth = {
  currentUserPubky: 'alice',
  hasProfile: true,
  sessionReference: mockGrantReference(),
  generation: 'new',
  retiringSession: null,
};
beforeEach(() => {
  localStorage.clear();
  LocalAuthService.read();
  vi.mocked(clearDatabase).mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => void) => callback() },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});
describe('durable authentication transitions', () => {
  it('checks cancellation inside the lock before changing the durable record', async () => {
    let release!: () => void;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, callback: () => void) =>
          new Promise<void>((resolve, reject) => {
            release = () => {
              try {
                callback();
                resolve();
              } catch (error) {
                reject(error);
              }
            };
          }),
      },
    });
    let active = true;
    const transition = LocalAuthService.commit(record, '', () => active);
    const rejected = expect(transition).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    active = false;
    release();
    await rejected;
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).toBeNull();
    // A subsequent explicit transition still works after cancellation.
    const retry = LocalAuthService.commit(record, '');
    release();
    await retry;
    expect(LocalAuthService.read()?.generation).toBe('new');
  });
  it('does not replace a newer generation', async () => {
    await LocalAuthService.commit(record, '');
    await expect(LocalAuthService.commit({ ...record, generation: 'stale' }, '')).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
    expect(LocalAuthService.read()?.generation).toBe('new');
  });
  it('normalizes malformed record errors without attaching credential data', () => {
    localStorage.setItem(AUTH_PERSIST_KEY, '{private-material');
    try {
      LocalAuthService.read();
      expect.fail('Must reject');
    } catch (error) {
      expect(error).toMatchObject({ code: 'QUERY_FAILED' });
      expect(JSON.stringify(error)).not.toContain('private-material');
    }
  });
});

describe('explicit logout recovery', () => {
  it('does not use a locally suppressed logout snapshot to authorize a new durable login', async () => {
    await LocalAuthService.commit(record, '');
    LocalAuthService.suppressRestore(record.generation);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    expect(LocalAuthService.read()?.sessionReference).toBeNull();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await expect(
      LocalAuthService.commit({ ...record, generation: 'replacement' }, record.generation),
    ).rejects.toThrow();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('replaces a corrupt reference with a durable signed-out record', async () => {
    localStorage.setItem(AUTH_PERSIST_KEY, '{broken');
    const signedOut = { ...record, currentUserPubky: null, sessionReference: null, hasProfile: null };
    await LocalAuthService.commit(signedOut, '');
    expect(LocalAuthService.read()?.sessionReference).toBeNull();
  });
  it('requires Web Locks for new adoption while still allowing explicit logout', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    await expect(LocalAuthService.commit(record, '')).rejects.toMatchObject({ code: 'INIT_FAILED' });
    await LocalAuthService.commit({ ...record, currentUserPubky: null, sessionReference: null, hasProfile: null }, '');
    expect(LocalAuthService.read()?.sessionReference).toBeNull();
  });
});

describe('shared account preparation', () => {
  beforeEach(() => {
    const locks = new Map<string, Promise<unknown>>();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (name: string, callback: () => unknown) => {
          const task = (locks.get(name) ?? Promise.resolve()).catch(() => {}).then(callback);
          locks.set(name, task);
          return task;
        },
      },
    });
  });

  it('holds all tabs behind the same cleanup and clears the durable requirement only after success', async () => {
    await LocalAuthService.commit({ ...record, needsAccountPreparation: true }, '');
    const clearing = Promise.withResolvers<void>();
    vi.mocked(clearDatabase).mockReturnValueOnce(clearing.promise);
    const first = LocalAuthService.prepareAccount(record.generation, () => true);
    let secondFinished = false;
    const second = LocalAuthService.prepareAccount(record.generation, () => true).then(() => {
      secondFinished = true;
    });
    await vi.waitFor(() => expect(clearDatabase).toHaveBeenCalledOnce());
    expect(secondFinished).toBe(false);
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(true);
    clearing.resolve();
    await Promise.all([first, second]);
    expect(clearDatabase).toHaveBeenCalledOnce();
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(false);
  });

  it('keeps failed preparation durable and actually retries cleanup', async () => {
    await LocalAuthService.commit({ ...record, needsAccountPreparation: true }, '');
    vi.mocked(clearDatabase).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(LocalAuthService.prepareAccount(record.generation, () => true)).rejects.toMatchObject({
      code: 'WRITE_FAILED',
    });
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(true);
    await LocalAuthService.prepareAccount(record.generation, () => true);
    expect(clearDatabase).toHaveBeenCalledTimes(2);
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(false);
  });

  it('lets logout commit while cleanup is blocked and rejects the late cleanup owner', async () => {
    await LocalAuthService.commit({ ...record, needsAccountPreparation: true }, '');
    const opening = Promise.withResolvers<void>();
    let cleared = false;
    vi.mocked(clearDatabase).mockImplementationOnce(async (isCurrent) => {
      await opening.promise;
      if (isCurrent?.()) cleared = true;
    });
    const pending = LocalAuthService.prepareAccount(record.generation, () => true);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    await vi.waitFor(() => expect(clearDatabase).toHaveBeenCalledOnce());
    await LocalAuthService.commit(
      { ...record, generation: 'logout', currentUserPubky: null, sessionReference: null, hasProfile: null },
      record.generation,
    );
    opening.resolve();
    await rejected;
    expect(cleared).toBe(false);
    expect(LocalAuthService.read()?.generation).toBe('logout');
  });

  it('does not let old preparation clear the new generation requirement', async () => {
    await LocalAuthService.commit({ ...record, needsAccountPreparation: true }, '');
    const clearing = Promise.withResolvers<void>();
    vi.mocked(clearDatabase).mockReturnValueOnce(clearing.promise);
    const pending = LocalAuthService.prepareAccount(record.generation, () => true);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    await vi.waitFor(() => expect(clearDatabase).toHaveBeenCalledOnce());
    await LocalAuthService.commit(
      { ...record, generation: 'replacement', needsAccountPreparation: true },
      record.generation,
    );
    clearing.resolve();
    await rejected;
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(true);
    await LocalAuthService.prepareAccount('replacement', () => true);
    expect(clearDatabase).toHaveBeenCalledTimes(2);
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(false);
  });

  it('does not bypass required cleanup when Web Locks are unavailable', async () => {
    await LocalAuthService.commit({ ...record, needsAccountPreparation: true }, '');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    await expect(LocalAuthService.prepareAccount(record.generation, () => true)).rejects.toMatchObject({
      code: 'INIT_FAILED',
    });
    expect(clearDatabase).not.toHaveBeenCalled();
    expect(LocalAuthService.read()?.needsAccountPreparation).toBe(true);
  });
});

it('preserves the underlying storage failure for diagnostics', () => {
  const cause = new DOMException('Storage denied', 'SecurityError');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw cause;
  });
  expect(() => LocalAuthService.read()).toThrow(expect.objectContaining({ code: 'QUERY_FAILED', cause }));
});

it('does not resurrect a retirement completed after the caller read its snapshot', async () => {
  const predecessor = mockGrantReference('predecessor');
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({ version: 3, state: { ...record, pendingRetirements: [predecessor] } }),
  );
  const stale = LocalAuthService.read()!;
  await LocalAuthService.finishRetirement(predecessor.sessionStoreId);
  await LocalAuthService.commit({ ...stale, generation: 'later' }, record.generation);
  expect(LocalAuthService.read()?.pendingRetirements).toEqual([]);
});
