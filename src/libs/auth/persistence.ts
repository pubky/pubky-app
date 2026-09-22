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

/** Read-only snapshot for generation checks, including browsers without Web Locks. */
export function readAuthStorage(storage: Storage, name = AUTH_PERSIST_KEY): string | null {
  const current = storage.getItem(name);
  if (current !== null) {
    const envelope = JSON.parse(current);
    return JSON.stringify({ ...envelope, state: persistedAuthSchema.parse(envelope.state) });
  }
  if (name !== AUTH_PERSIST_KEY || storage.getItem(AUTH_MIGRATION_KEY)) return null;
  const legacy = storage.getItem(LEGACY_AUTH_PERSIST_KEY);
  if (legacy === null) return null;
  const { state } = legacySchema.parse(JSON.parse(legacy));
  return JSON.stringify({
    version: 2,
    state: {
      currentUserPubky: state.currentUserPubky,
      sessionReference: state.sessionExport ? { kind: 'cookie', sessionExport: state.sessionExport } : null,
      hasProfile: state.hasProfile,
      generation: 'legacy',
      retiringSession: null,
    },
  });
}

/**
 * Every writer shares LocalAuthService's lock. lockHeld is only for its explicit durable transition.
 * Zustand metadata is best effort; migration and explicit transitions must report storage failures.
 */
export function createAuthStorage(storage: Storage, lockHeld = false) {
  function finishMigration() {
    // The v2 write is the commit point. Housekeeping must not undo a durable adoption.
    try {
      storage.setItem(AUTH_MIGRATION_KEY, '1');
      storage.removeItem(LEGACY_AUTH_PERSIST_KEY);
    } catch {
      /* Retry housekeeping on the next write. */
    }
  }
  return {
    getItem(name: string): string | null | Promise<string | null> {
      const snapshot = readAuthStorage(storage, name);
      if (!snapshot || storage.getItem(name) !== null || !navigator.locks) return snapshot;
      return navigator.locks.request(AUTH_PERSIST_KEY, () => {
        // A logout or adoption may have won while this legacy import was waiting.
        const latest = readAuthStorage(storage, name);
        if (!latest || storage.getItem(name) !== null) return latest;
        const envelope = JSON.parse(latest);
        envelope.state.generation = crypto.randomUUID();
        const migrated = JSON.stringify(envelope);
        storage.setItem(name, migrated);
        finishMigration();
        return migrated;
      });
    },
    setItem(name: string, value: string): void | Promise<void> {
      const write = () => {
        let next = JSON.parse(value);
        if (!lockHeld) {
          const current = storage.getItem(name);
          // Never replace a failed/uncompleted legacy migration with Zustand's initial state.
          if (current === null && storage.getItem(LEGACY_AUTH_PERSIST_KEY) && !storage.getItem(AUTH_MIGRATION_KEY))
            return;
          if (current !== null) {
            const previous = JSON.parse(current);
            if (previous.state.generation !== next.state.generation) return;
            // Metadata cannot change identity or revive a completed retirement from a stale tab.
            next = {
              ...previous,
              state: {
                ...previous.state,
                hasProfile:
                  previous.state.hasProfile === true ? true : (next.state.hasProfile ?? previous.state.hasProfile),
                retiringSession: previous.state.retiringSession ? next.state.retiringSession : null,
              },
            };
          }
        }
        storage.setItem(name, JSON.stringify(next));
        finishMigration();
      };
      if (lockHeld) return write();
      // Unsupported browsers may restore existing sessions, but cannot safely write metadata.
      if (!navigator.locks) return;
      return navigator.locks.request(AUTH_PERSIST_KEY, write).catch(() => {});
    },
    removeItem(name: string): void | Promise<void> {
      const remove = () => {
        storage.setItem(AUTH_MIGRATION_KEY, '1');
        storage.removeItem(name);
        storage.removeItem(LEGACY_AUTH_PERSIST_KEY);
      };
      if (lockHeld) return remove();
      if (navigator.locks) return navigator.locks.request(AUTH_PERSIST_KEY, remove);
      // Explicit local cleanup remains available without Web Locks.
      remove();
    },
  };
}
