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

/**
 * Wrap a store snapshot in a Zustand-style hook with selector + getState support.
 *
 * Used when `vi.mock(...)` needs to replace a Zustand hook with a deterministic
 * snapshot — e.g. the VRT harness, where the rendered tree calls both
 * `useStore()` and `useStore(selector)` forms and the same snapshot must satisfy
 * both.
 */
export function createZustandLikeHook<T extends object>(snapshot: T) {
  function hook(): T;
  function hook<U>(selector: (state: T) => U): U;
  function hook<U>(selector?: (state: T) => U): T | U {
    return selector ? selector(snapshot) : snapshot;
  }
  hook.getState = () => snapshot;
  hook.setState = vi.fn();
  hook.subscribe = vi.fn(() => () => {});
  return hook;
}
