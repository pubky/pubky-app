import { describe, expect, it } from 'vitest';
import { AUTH_PERSIST_KEY } from '@/core/stores/persistedKeys';
import { parsePersistedAuthStoreValue, SESSION_BRIDGE_AUTH_STORAGE_KEY } from './persisted-session';

describe('parsePersistedAuthStoreValue', () => {
  it('uses the same localStorage key as the auth store persist middleware', () => {
    expect(SESSION_BRIDGE_AUTH_STORAGE_KEY).toBe(AUTH_PERSIST_KEY);
    expect(SESSION_BRIDGE_AUTH_STORAGE_KEY).toBe('auth-store');
  });

  it('returns sessionExport from a valid persisted entry', () => {
    const raw = JSON.stringify({
      state: {
        currentUserPubky: 'abc',
        sessionExport: 'export-base64',
        hasProfile: true,
        hasHydrated: false,
      },
      version: 0,
    });

    expect(parsePersistedAuthStoreValue(raw)).toBe('export-base64');
  });

  it('returns null when signed out (sessionExport is null)', () => {
    const raw = JSON.stringify({
      state: {
        currentUserPubky: null,
        sessionExport: null,
        hasProfile: null,
        hasHydrated: false,
      },
      version: 0,
    });

    expect(parsePersistedAuthStoreValue(raw)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parsePersistedAuthStoreValue('{not json')).toBeNull();
  });

  it('returns null when the key is missing', () => {
    expect(parsePersistedAuthStoreValue(null)).toBeNull();
  });

  it('returns null when sessionExport is a non-string', () => {
    expect(
      parsePersistedAuthStoreValue(
        JSON.stringify({
          state: { sessionExport: 12, currentUserPubky: 'pk', hasProfile: false, hasHydrated: false },
          version: 0,
        }),
      ),
    ).toBeNull();
    expect(
      parsePersistedAuthStoreValue(
        JSON.stringify({
          state: { sessionExport: { nested: true }, currentUserPubky: 'pk', hasProfile: false, hasHydrated: false },
          version: 0,
        }),
      ),
    ).toBeNull();
  });

  it('returns null without throwing for a __proto__ payload', () => {
    const raw = '{"__proto__":{"polluted":true},"state":{"sessionExport":"export-base64"}}';
    expect(() => parsePersistedAuthStoreValue(raw)).not.toThrow();
    expect(parsePersistedAuthStoreValue(raw)).toBeNull();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
