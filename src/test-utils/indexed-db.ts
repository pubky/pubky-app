/** Deletes a database through the global IndexedDB factory (fake-indexeddb in unit tests). */
export const deleteNativeDatabase = (name: string, onBlocked?: () => void) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete database'));
    request.onblocked = () => onBlocked?.();
  });

/**
 * A tab of another app build sharing the profile's database (ADR-0019): opens `name` at `rawVersion` with a store this
 * build does not declare and keeps the connection, reporting every `versionchange` it receives.
 */
export const openOtherBuildDatabase = (name: string, rawVersion: number, onVersionChange: () => void = () => {}) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, rawVersion);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('legacy_store', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = onVersionChange;
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open the other build database'));
  });
