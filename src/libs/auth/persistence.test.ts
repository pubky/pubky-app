import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MIGRATION_KEY, AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { createAuthStorage, readAuthStorage } from './persistence';

beforeEach(() => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  });
});
afterEach(() => vi.restoreAllMocks());

describe('auth persistence migration', () => {
  beforeEach(() => localStorage.clear());

  it('imports an existing cookie once and never revives an old-tab rewrite after logout', async () => {
    const legacy = JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'cookie', hasProfile: true } });
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy);
    const storage = createAuthStorage(localStorage);
    const migrated = JSON.parse((await storage.getItem(AUTH_PERSIST_KEY))!);
    expect(migrated.state.sessionReference).toEqual({ kind: 'cookie', sessionExport: 'cookie' });
    expect(localStorage.getItem(AUTH_MIGRATION_KEY)).toBe('1');
    await storage.removeItem(AUTH_PERSIST_KEY);
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy);
    expect(await storage.getItem(AUTH_PERSIST_KEY)).toBeNull();
  });
});

describe('auth generation fencing', () => {
  const envelope = (generation: string, sessionReference: unknown = null) =>
    JSON.stringify({
      version: 2,
      state: { generation, currentUserPubky: 'alice', hasProfile: true, sessionReference, retiringSession: null },
    });
  beforeEach(() => localStorage.clear());
  it('rejects late writes from the old generation after logout or replacement', async () => {
    const storage = createAuthStorage(localStorage);
    await storage.setItem(AUTH_PERSIST_KEY, envelope('first'));
    createAuthStorage(localStorage, true).setItem(AUTH_PERSIST_KEY, envelope('logout'));
    await storage.setItem(AUTH_PERSIST_KEY, envelope('first', { kind: 'cookie', sessionExport: 'old' }));
    expect(JSON.parse((await storage.getItem(AUTH_PERSIST_KEY))!).state.generation).toBe('logout');
  });
  it('preserves the legacy export when the first durable write fails', async () => {
    const legacy = JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'cookie', hasProfile: true } });
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy);
    const storage = {
      length: localStorage.length,
      clear: localStorage.clear.bind(localStorage),
      key: localStorage.key.bind(localStorage),
      getItem: localStorage.getItem.bind(localStorage),
      setItem: () => {
        throw new DOMException('Full', 'QuotaExceededError');
      },
      removeItem: localStorage.removeItem.bind(localStorage),
    } as Storage;
    await expect(createAuthStorage(storage).getItem(AUTH_PERSIST_KEY)).rejects.toThrow();
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy);
    expect(localStorage.getItem(AUTH_MIGRATION_KEY)).toBeNull();
  });
  it('keeps v2 authoritative if a crash leaves the old cookie export behind', () => {
    localStorage.setItem(AUTH_PERSIST_KEY, envelope('logout'));
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'old', hasProfile: true } }),
    );
    expect(JSON.parse(readAuthStorage(localStorage)!).state.sessionReference).toBeNull();
  });
});

describe('migration commit point', () => {
  beforeEach(() => localStorage.clear());
  it('keeps a successful v2 write authoritative if saving the marker fails', async () => {
    const storage: Storage = {
      length: 0,
      key: localStorage.key.bind(localStorage),
      clear: localStorage.clear.bind(localStorage),
      getItem: localStorage.getItem.bind(localStorage),
      removeItem: localStorage.removeItem.bind(localStorage),
      setItem: (key, value) => {
        if (key === AUTH_MIGRATION_KEY) throw new DOMException('Full', 'QuotaExceededError');
        localStorage.setItem(key, value);
      },
    };
    const value = JSON.stringify({
      version: 2,
      state: {
        generation: 'adopted',
        currentUserPubky: null,
        sessionReference: null,
        hasProfile: null,
        retiringSession: null,
      },
    });
    expect(() => createAuthStorage(storage, true).setItem(AUTH_PERSIST_KEY, value)).not.toThrow();
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).toBe(value);
  });
  it('does not overwrite an unimported legacy record during hydration metadata writes', () => {
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, 'old-cookie-record');
    createAuthStorage(localStorage).setItem(AUTH_PERSIST_KEY, JSON.stringify({ state: { generation: '' } }));
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe('old-cookie-record');
  });
});

describe('queued cross-tab persistence', () => {
  const envelope = (generation: string, retiringSession: unknown = null, hasProfile: boolean | null = null) =>
    JSON.stringify({
      version: 2,
      state: { generation, currentUserPubky: null, sessionReference: null, retiringSession, hasProfile },
    });
  let runNext: () => void;
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, callback: () => unknown) =>
          new Promise((resolve) => {
            runNext = () => resolve(callback());
          }),
      },
    });
  });
  it('re-reads inside the migration lock instead of resurrecting a logged-out cookie', async () => {
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'cookie', hasProfile: true } }),
    );
    const pending = createAuthStorage(localStorage).getItem(AUTH_PERSIST_KEY);
    // Another tab owns the lock and commits logout before the import acquires it.
    createAuthStorage(localStorage, true).setItem(AUTH_PERSIST_KEY, envelope('logout'));
    runNext();
    expect(JSON.parse((await pending)!).state.generation).toBe('logout');
    expect(JSON.parse(readAuthStorage(localStorage)!).state.sessionReference).toBeNull();
  });
  it('rechecks a queued metadata write after a new session wins', async () => {
    localStorage.setItem(AUTH_PERSIST_KEY, envelope('old'));
    const pending = createAuthStorage(localStorage).setItem(AUTH_PERSIST_KEY, envelope('old', null, true));
    createAuthStorage(localStorage, true).setItem(AUTH_PERSIST_KEY, envelope('new'));
    runNext();
    await pending;
    expect(JSON.parse(readAuthStorage(localStorage)!).state).toMatchObject({ generation: 'new', hasProfile: null });
  });
  it.each([null, false])(
    'cannot revive retirement or erase profile discovery with stale %s metadata',
    async (hasProfile) => {
      localStorage.setItem(AUTH_PERSIST_KEY, envelope('same', null, true));
      const pending = createAuthStorage(localStorage).setItem(
        AUTH_PERSIST_KEY,
        envelope('same', { kind: 'cookie', sessionExport: 'old' }, hasProfile),
      );
      runNext();
      await pending;
      expect(JSON.parse(readAuthStorage(localStorage)!).state).toMatchObject({
        retiringSession: null,
        hasProfile: true,
      });
    },
  );
  it('reads old cookies without mutating storage when Web Locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'cookie', hasProfile: true } }),
    );
    expect(JSON.parse((await createAuthStorage(localStorage).getItem(AUTH_PERSIST_KEY))!).state.generation).toBe(
      'legacy',
    );
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).not.toBeNull();
  });
});
