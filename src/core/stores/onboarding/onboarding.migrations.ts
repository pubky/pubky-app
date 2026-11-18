import type { OnboardingState } from './onboarding.types';

export const ONBOARDING_STORE_VERSION = 1;

/** The fields `onboarding-storage` keeps; `hasHydrated` is written as `false` and set on rehydration. */
export type PersistedOnboardingState = Omit<OnboardingState, 'hasHydrated'> & { hasHydrated: false };

/** Recovery material the in-browser sign-up stored before #3142. Version 1 deletes it. */
const BROWSER_KEY_FIELDS = ['secretKey', 'mnemonic', 'signupAttempt'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Version 0 kept the root key, recovery phrase and sign-up attempt of an account created in the browser. Version 1
 * deletes them on the first load after the deadline announced in #3236, and zustand writes the result back, so no copy
 * stays in local storage. Every other field is kept as stored.
 */
export function migrateOnboardingPersistedState(persistedState: unknown, version: number): PersistedOnboardingState {
  const state = isRecord(persistedState) ? { ...persistedState } : {};
  if (version < ONBOARDING_STORE_VERSION) {
    for (const field of BROWSER_KEY_FIELDS) delete state[field];
  }
  return state as PersistedOnboardingState;
}
