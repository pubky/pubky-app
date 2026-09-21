import { z } from 'zod';
import { persistedAuthSchema } from '@/libs/auth/session.types';
import { AUTH_MIGRATION_KEY, AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

const legacySchema = z.object({
  state: z.object({
    currentUserPubky: z.string().nullable(),
    sessionExport: z.string().nullable(),
    hasProfile: z.boolean().nullable(),
  }),
});

/** Zustand metadata writes are best effort. Explicit controller transitions require durable success. */
export function createAuthStorage(storage: Storage, allowGenerationChange = false) {
  function finishMigration() {
    // The v2 write is the commit point. Failure of this housekeeping must not undo a durable adoption.
    try {
      storage.setItem(AUTH_MIGRATION_KEY, '1');
      storage.removeItem(LEGACY_AUTH_PERSIST_KEY);
    } catch {
      /* Keep the authoritative v2 record and retry housekeeping on the next write. */
    }
  }
  return {
    getItem(name: string): string | null {
      const current = storage.getItem(name);
      if (current !== null) {
        const envelope = JSON.parse(current);
        return JSON.stringify({ ...envelope, state: persistedAuthSchema.parse(envelope.state) });
      }
      if (name !== AUTH_PERSIST_KEY || storage.getItem(AUTH_MIGRATION_KEY)) return null;
      const legacy = storage.getItem(LEGACY_AUTH_PERSIST_KEY);
      if (legacy === null) return null;
      const { state } = legacySchema.parse(JSON.parse(legacy));
      const migrated = JSON.stringify({
        version: 2,
        state: {
          currentUserPubky: state.currentUserPubky,
          sessionReference: state.sessionExport ? { kind: 'cookie', sessionExport: state.sessionExport } : null,
          hasProfile: state.hasProfile,
          generation: crypto.randomUUID(),
          retiringSession: null,
        },
      });
      // Save first. A quota error must leave the sole recoverable record untouched.
      storage.setItem(name, migrated);
      finishMigration();
      return migrated;
    },
    setItem(name: string, value: string): void {
      try {
        const current = storage.getItem(name);
        if (!allowGenerationChange) {
          // Failed migration must not be replaced by Zustand's initial signed-out state.
          if (current === null && storage.getItem(LEGACY_AUTH_PERSIST_KEY) && !storage.getItem(AUTH_MIGRATION_KEY))
            return;
          if (current !== null && JSON.parse(current).state.generation !== JSON.parse(value).state.generation) return;
        }
        storage.setItem(name, value);
        finishMigration();
      } catch (error) {
        // UI status/metadata may still update in memory when storage is unavailable.
        // Only LocalAuthService's explicit, serialized transition can adopt a different session.
        if (allowGenerationChange) throw error;
      }
    },
    removeItem(name: string): void {
      storage.setItem(AUTH_MIGRATION_KEY, '1');
      storage.removeItem(name);
      storage.removeItem(LEGACY_AUTH_PERSIST_KEY);
    },
  };
}
