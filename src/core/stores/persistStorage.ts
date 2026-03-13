import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * No-op storage fallback used when localStorage is unavailable or malformed.
 */
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function hasStorageApi(storage: unknown): storage is StateStorage {
  if (!storage || typeof storage !== 'object') {
    return false;
  }

  const candidate = storage as Partial<StateStorage>;
  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  );
}

function resolveStorage(): StateStorage {
  if (typeof window === 'undefined') {
    return noopStorage;
  }

  try {
    const storage = window.localStorage;
    return hasStorageApi(storage) ? storage : noopStorage;
  } catch {
    return noopStorage;
  }
}

export function createPersistStorage() {
  return createJSONStorage(() => resolveStorage());
}
