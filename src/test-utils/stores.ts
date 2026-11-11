import { vi } from 'vitest';
import type { AuthStore } from '@/stores/auth/auth.types';
import type { HomeStore } from '@/stores/home/home.types';
import type { HotStore } from '@/stores/hot/hot.types';
import type { LocalFilesStore } from '@/stores/localFiles/localFiles.types';
import type { MigrationStore } from '@/stores/migration/migration.types';
import type { NotificationStore } from '@/stores/notification/notification.types';
import type { OnboardingStore } from '@/stores/onboarding/onboarding.types';
import type { SearchStore } from '@/stores/search/search.types';
import type { SettingsStore } from '@/stores/settings/settings.types';
import type { SignInStore } from '@/stores/signIn/signIn.types';

/**
 * Build a partial Zustand store double for tests.
 *
 * Tests that only read a few fields of a store still want the input to be
 * typed against the real store so typos / stale fields are caught. Each
 * factory takes a `Partial<Store>` and returns the full `Store` type, burying
 * the cast in one central place.
 */
const buildStore = <TStore>(partial: Partial<TStore>): TStore => partial as TStore;

export const mockAuthStore = (partial: Partial<AuthStore> = {}): AuthStore => buildStore(partial);

export const mockOnboardingStore = (partial: Partial<OnboardingStore> = {}): OnboardingStore => buildStore(partial);

export const mockMigrationStore = (partial: Partial<MigrationStore> = {}): MigrationStore => buildStore(partial);

export const mockNotificationStore = (partial: Partial<NotificationStore> = {}): NotificationStore =>
  buildStore(partial);

export const mockHomeStore = (partial: Partial<HomeStore> = {}): HomeStore => buildStore(partial);

export const mockSettingsStore = (partial: Partial<SettingsStore> = {}): SettingsStore => buildStore(partial);

export const mockSignInStore = (partial: Partial<SignInStore> = {}): SignInStore => buildStore(partial);

export const mockLocalFilesStore = (partial: Partial<LocalFilesStore> = {}): LocalFilesStore => buildStore(partial);

export const mockHotStore = (partial: Partial<HotStore> = {}): HotStore => buildStore(partial);

export const mockSearchStore = (partial: Partial<SearchStore> = {}): SearchStore => buildStore(partial);

/** Own keys that identify an auth-store snapshot among the other store doubles. */
const AUTH_SNAPSHOT_KEYS = [
  'currentUserPubky',
  'selectCurrentUserPubky',
  'selectSession',
  'selectIsAuthenticated',
  'setShowSignInDialog',
  'sessionExport',
  'sessionReference',
] as const;

/**
 * Auth snapshots that omit `session` read it back as `null`.
 *
 * The auth store's session is `Session | null` and starts at `null` (`authInitialState`). A partial
 * double leaves the property missing, so `session !== null` is true and `session.info` throws once
 * DialogLocksAuth mounts from the post menu (#3052). `null` is that signed-out value. Snapshots that
 * already set `session`, and snapshots for other stores, pass through. The same object is returned,
 * so later writes on it stay visible to the hook.
 */
function withOmittedAuthSession<T extends object>(snapshot: T): T {
  if ('session' in snapshot) return snapshot;
  if (!AUTH_SNAPSHOT_KEYS.some((key) => key in snapshot)) return snapshot;
  return Object.assign(snapshot, { session: null });
}

/**
 * Wrap a store snapshot in a Zustand-style hook with selector + getState support.
 *
 * Used when `vi.mock(...)` needs to replace a Zustand hook with a deterministic
 * snapshot — e.g. the VRT harness, where the rendered tree calls both
 * `useStore()` and `useStore(selector)` forms and the same snapshot must satisfy
 * both.
 */
export function createZustandLikeHook<T extends object>(snapshot: T) {
  const state = withOmittedAuthSession(snapshot);
  function hook(): T;
  function hook<U>(selector: (state: T) => U): U;
  function hook<U>(selector?: (state: T) => U): T | U {
    return selector ? selector(state) : state;
  }
  hook.getState = () => state;
  hook.setState = vi.fn();
  hook.subscribe = vi.fn(() => () => {});
  return hook;
}
