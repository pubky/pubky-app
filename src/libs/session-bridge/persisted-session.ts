import { AUTH_PERSIST_KEY } from '@/core/stores/persistedKeys';

export { AUTH_PERSIST_KEY as SESSION_BRIDGE_AUTH_STORAGE_KEY };

/**
 * Zustand persist middleware writes:
 * `{ state: { sessionExport, currentUserPubky, hasProfile, hasHydrated }, version }`
 */
export function parsePersistedAuthStoreValue(raw: string | null): string | null {
  if (raw === null || raw === '') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(parsed, '__proto__')) {
      return null;
    }

    const state = (parsed as { state?: unknown }).state;
    if (state === null || typeof state !== 'object') {
      return null;
    }

    const sessionExport = (state as { sessionExport?: unknown }).sessionExport;
    if (typeof sessionExport !== 'string' || sessionExport.length === 0) {
      return null;
    }

    return sessionExport;
  } catch {
    return null;
  }
}

export function readPersistedSessionExport(storage: Pick<Storage, 'getItem'>): string | null {
  return parsePersistedAuthStoreValue(storage.getItem(AUTH_PERSIST_KEY));
}
