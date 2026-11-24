import { legacyCookieExports, readAuthStorage } from '@/libs/auth/persistence';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { needsShopCleanup, SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY } from '@/libs/shop-embed/cleanup';
import { hasAccountState } from '@/stores/auth/auth.selectors';
import type { AuthState } from '@/stores/auth/auth.types';
import { AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

const legacyKeys = [LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY];
const landingStorageKeys = new Set([AUTH_PERSIST_KEY, ...legacyKeys, SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY]);

export function isLandingAuthStorageKey(key: string | null): boolean {
  return key === null || landingStorageKeys.has(key);
}

export type LandingMode = 'public' | 'cleanup' | 'guarded';

type LandingAuthState = Pick<
  AuthState,
  'generation' | 'hasHydrated' | 'session' | 'sessionReference' | 'restoreStatus'
>;

/** Classify the stored state without mounting coordinators or changing the guest's generation. */
export function getLandingAuthMode(storage: Storage, current: LandingAuthState): LandingMode | 'rehydrate-guest' {
  const stored = readAuthStorage(storage);
  const record: PersistedAuth | null = stored ? JSON.parse(stored).state : null;
  if (record?.currentUserPubky || record?.sessionReference || (!record && current.generation !== '')) return 'guarded';
  if (!current.hasHydrated) return 'public';

  const hasCleanup = Boolean(
    record?.retiringSession ||
    record?.pendingRetirements?.length ||
    needsShopCleanup(storage, record?.shopCleanupEpoch) ||
    legacyKeys.some((key) => {
      const raw = storage.getItem(key);
      return raw !== null && legacyCookieExports(key, raw).length > 0;
    }),
  );
  if (record && record.generation !== current.generation) {
    // Reconcile a stale identity before attempting cleanup. Two clean guests can just align their generations.
    if (hasCleanup) return 'guarded';
    if (!hasAccountState(current)) return 'rehydrate-guest';
  }
  return hasCleanup ? 'cleanup' : 'public';
}
