import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_MIGRATION_KEY, AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { createAuthStorage } from './persistence';

describe('auth persistence migration', () => {
  beforeEach(() => localStorage.clear());

  it('imports an existing cookie once and never revives an old-tab rewrite after logout', () => {
    const legacy = JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'cookie', hasProfile: true } });
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy);
    const storage = createAuthStorage(localStorage);
    const migrated = JSON.parse(storage.getItem(AUTH_PERSIST_KEY)!);
    expect(migrated.state.sessionReference).toEqual({ kind: 'cookie', sessionExport: 'cookie' });
    expect(localStorage.getItem(AUTH_MIGRATION_KEY)).toBe('1');
    storage.removeItem(AUTH_PERSIST_KEY);
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy);
    expect(storage.getItem(AUTH_PERSIST_KEY)).toBeNull();
  });
});

describe('auth generation fencing', () => {
  const envelope = (generation: string, sessionReference: unknown = null) =>
    JSON.stringify({
      version: 2,
      state: { generation, currentUserPubky: 'alice', hasProfile: true, sessionReference, retiringSession: null },
    });
  beforeEach(() => localStorage.clear());
  it('rejects late writes from the old generation after logout or replacement', () => {
    const storage = createAuthStorage(localStorage);
    storage.setItem(AUTH_PERSIST_KEY, envelope('first'));
    createAuthStorage(localStorage, true).setItem(AUTH_PERSIST_KEY, envelope('logout'));
    storage.setItem(AUTH_PERSIST_KEY, envelope('first', { kind: 'cookie', sessionExport: 'old' }));
    expect(JSON.parse(storage.getItem(AUTH_PERSIST_KEY)!).state.generation).toBe('logout');
  });
  it('preserves the legacy export when the first durable write fails', () => {
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
    expect(() => createAuthStorage(storage).getItem(AUTH_PERSIST_KEY)).toThrow();
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy);
    expect(localStorage.getItem(AUTH_MIGRATION_KEY)).toBeNull();
  });
  it('keeps v2 authoritative if a crash leaves the old cookie export behind', () => {
    localStorage.setItem(AUTH_PERSIST_KEY, envelope('logout'));
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { currentUserPubky: 'alice', sessionExport: 'old', hasProfile: true } }),
    );
    expect(JSON.parse(createAuthStorage(localStorage).getItem(AUTH_PERSIST_KEY)!).state.sessionReference).toBeNull();
  });
});

describe('migration commit point', () => {
  beforeEach(() => localStorage.clear());
  it('keeps a successful v2 write authoritative if saving the marker fails', () => {
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
