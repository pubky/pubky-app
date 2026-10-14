import { z } from 'zod';
import { persistedAuthSchema, sessionReferenceSchema } from '@/libs/auth/session.types';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import {
  AUTH_MIGRATION_KEY,
  AUTH_PERSIST_KEY,
  AUTH_STORE_VERSION,
  LEGACY_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_MIGRATION_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
} from '@/stores/persistedKeys';

// Cookie references never reach live app state; old metadata is retained only for remote revocation.
const oldReferenceSchema = z.union([
  sessionReferenceSchema,
  z.object({ kind: z.literal('cookie') }).transform(() => null),
]);
const previousSchema = persistedAuthSchema.extend({
  sessionReference: oldReferenceSchema.nullable(),
  retiringSession: oldReferenceSchema.nullable().default(null),
});
const legacySchema = z.object({
  state: z.object({
    currentUserPubky: z.string().nullable(),
    hasProfile: z.boolean().nullable().default(null),
  }),
});

/** Extract only pre-grant cookie metadata, never a v2 grant reference. */
export function legacyCookieExports(key: string, raw: string): string[] {
  try {
    const envelope = z.object({ state: z.record(z.string(), z.unknown()) }).parse(JSON.parse(raw));
    const candidates =
      key === LEGACY_AUTH_PERSIST_KEY
        ? [envelope.state.sessionExport]
        : [envelope.state.sessionReference, envelope.state.retiringSession].map((value) => {
            const cookie = z.object({ kind: z.literal('cookie'), sessionExport: z.string() }).safeParse(value);
            return cookie.success ? cookie.data.sessionExport : null;
          });
    return [...new Set(candidates.filter((value): value is string => typeof value === 'string' && value.length > 0))];
  } catch {
    return [];
  }
}

// A failed durable logout still signs this tab out. Keep the real generation as the
// next login's compare-and-swap base, but never restore its discarded credentials.
let locallySignedOutGeneration: string | null = null;

export function suppressAuthRestore(generation: string): void {
  locallySignedOutGeneration = generation;
}

function localSignedOutSnapshot(): string {
  return JSON.stringify({
    version: AUTH_STORE_VERSION,
    state: {
      currentUserPubky: null,
      sessionReference: null,
      hasProfile: null,
      generation: locallySignedOutGeneration,
      retiringSession: null,
    },
  });
}

/** Read-only snapshot for generation checks, including browsers without Web Locks. */
export function readAuthStorage(storage: Storage, name = AUTH_PERSIST_KEY): string | null {
  let snapshot: string | null;
  try {
    snapshot = readDurableAuthStorage(storage, name);
  } catch (error) {
    if (name === AUTH_PERSIST_KEY && locallySignedOutGeneration !== null) return localSignedOutSnapshot();
    throw error;
  }
  if (name !== AUTH_PERSIST_KEY || locallySignedOutGeneration === null) return snapshot;
  if (snapshot && JSON.parse(snapshot).state.generation === locallySignedOutGeneration) return localSignedOutSnapshot();
  locallySignedOutGeneration = null;
  return snapshot;
}

/** Unmasked durable state for compare-and-swap; a local logout must never hide read failures from a writer. */
export function readDurableAuthStorage(storage: Storage, name = AUTH_PERSIST_KEY): string | null {
  const current = storage.getItem(name);
  if (current !== null) {
    const envelope = JSON.parse(current);
    return JSON.stringify({ ...envelope, state: persistedAuthSchema.parse(envelope.state) });
  }
  if (name !== AUTH_PERSIST_KEY || storage.getItem(AUTH_MIGRATION_KEY)) return null;
  const previous = storage.getItem(PREVIOUS_AUTH_PERSIST_KEY);
  if (previous !== null) {
    return JSON.stringify({ version: AUTH_STORE_VERSION, state: previousSchema.parse(JSON.parse(previous).state) });
  }
  // A prior v2 logout must also prevent a stale v1 tab from reviving its identity.
  if (storage.getItem(PREVIOUS_AUTH_MIGRATION_KEY)) return null;
  const legacy = storage.getItem(LEGACY_AUTH_PERSIST_KEY);
  if (legacy === null) return null;
  const { state } = legacySchema.parse(JSON.parse(legacy));
  return JSON.stringify({
    version: AUTH_STORE_VERSION,
    state: {
      currentUserPubky: state.currentUserPubky,
      sessionReference: null,
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
export function createAuthStorage(source: Storage | (() => Storage), lockHeld = false) {
  const getStorage = () => (typeof source === 'function' ? source() : source);
  function finishMigration() {
    // The v3 write is the commit point. Housekeeping must not undo a durable adoption.
    try {
      getStorage().setItem(AUTH_MIGRATION_KEY, '1');
      for (const key of [LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY]) {
        const raw = getStorage().getItem(key);
        // HttpOnly cookies must be revoked remotely before dropping their metadata.
        if (raw !== null && legacyCookieExports(key, raw).length === 0) getStorage().removeItem(key);
      }
    } catch {
      /* Retry housekeeping on the next write. */
    }
  }
  return {
    async getItem(name: string): Promise<string | null> {
      const snapshot = readAuthStorage(getStorage(), name);
      if (name === AUTH_PERSIST_KEY && locallySignedOutGeneration !== null) return snapshot;
      if (!snapshot || getStorage().getItem(name) !== null || !navigator.locks) return snapshot;
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          navigator.locks.request(AUTH_PERSIST_KEY, () => {
            // A timed-out hydration must not commit when the queued lock finally arrives.
            if (!active) return null;
            // A logout or adoption may have won while this legacy import was waiting.
            const latest = readAuthStorage(getStorage(), name);
            if (!latest || getStorage().getItem(name) !== null) return latest;
            getStorage().setItem(name, latest);
            finishMigration();
            return latest;
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              active = false;
              reject(
                Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Could not prepare the saved session. Try again.', {
                  service: ErrorService.Local,
                  operation: 'migrateAuthStorage',
                }),
              );
            }, 12_000);
          }),
        ]);
      } finally {
        active = false;
        clearTimeout(timer);
      }
    },
    setItem(name: string, value: string): void | Promise<void> {
      const write = () => {
        let next = JSON.parse(value);
        if (!lockHeld) {
          const current = getStorage().getItem(name);
          // Never replace a failed/uncompleted legacy migration with Zustand's initial state.
          if (current === null && readAuthStorage(getStorage(), name) !== null) return;
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
                // Revocation obligations change only through explicit locked transitions.
              },
            };
          }
        }
        getStorage().setItem(name, JSON.stringify(next));
        finishMigration();
      };
      if (lockHeld) return write();
      // Unsupported browsers cannot safely write shared metadata.
      if (!navigator.locks) return;
      return navigator.locks.request(AUTH_PERSIST_KEY, write).catch(() => {});
    },
    removeItem(name: string): void | Promise<void> {
      const remove = () => {
        getStorage().setItem(AUTH_MIGRATION_KEY, '1');
        getStorage().removeItem(name);
        finishMigration();
      };
      if (lockHeld) return remove();
      if (navigator.locks) return navigator.locks.request(AUTH_PERSIST_KEY, remove);
      // Explicit local cleanup remains available without Web Locks.
      remove();
    },
  };
}
