import type * as Core from '@/core';

/**
 * Build a partial Zustand store double for tests.
 *
 * Tests that only read a few fields of a store still want the input to be
 * typed against the real store so typos / stale fields are caught. Each
 * factory takes a `Partial<Store>` and returns the full `Store` type, burying
 * the cast in one central place.
 */
const buildStore = <TStore>(partial: Partial<TStore>): TStore => partial as TStore;

export const mockAuthStore = (partial: Partial<Core.AuthStore> = {}): Core.AuthStore => buildStore(partial);

export const mockOnboardingStore = (partial: Partial<Core.OnboardingStore> = {}): Core.OnboardingStore =>
  buildStore(partial);

export const mockMigrationStore = (partial: Partial<Core.MigrationStore> = {}): Core.MigrationStore =>
  buildStore(partial);

export const mockNotificationStore = (partial: Partial<Core.NotificationStore> = {}): Core.NotificationStore =>
  buildStore(partial);

export const mockHomeStore = (partial: Partial<Core.HomeStore> = {}): Core.HomeStore => buildStore(partial);

export const mockSettingsStore = (partial: Partial<Core.SettingsStore> = {}): Core.SettingsStore => buildStore(partial);

export const mockSignInStore = (partial: Partial<Core.SignInStore> = {}): Core.SignInStore => buildStore(partial);

export const mockLocalFilesStore = (partial: Partial<Core.LocalFilesStore> = {}): Core.LocalFilesStore =>
  buildStore(partial);

export const mockHotStore = (partial: Partial<Core.HotStore> = {}): Core.HotStore => buildStore(partial);

export const mockSearchStore = (partial: Partial<Core.SearchStore> = {}): Core.SearchStore => buildStore(partial);
