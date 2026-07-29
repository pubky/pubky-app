import { type HomeState, REACH } from './home.types';

export const HOME_STORE_VERSION = 1;

type PersistedHomeState = Omit<HomeState, 'hasHydrated'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getPersistedProfileTags(state: Record<string, unknown>): string[] {
  return Array.isArray(state.profileTags)
    ? state.profileTags.filter((tag): tag is string => typeof tag === 'string')
    : [];
}

/**
 * Version 0 stored the selected Reach and profile tags without recording
 * whether the user chose them. Preserve every existing Reach as explicit and
 * migrate only Network + tags to Tagged as because it has identical depth-2
 * semantics. Other tagged reaches keep their original depth with parked tags.
 */
export function migrateHomePersistedState(persistedState: unknown, version: number): PersistedHomeState {
  const state = isRecord(persistedState) ? persistedState : {};

  if (version >= HOME_STORE_VERSION) {
    return state as PersistedHomeState;
  }

  const profileTags = getPersistedProfileTags(state);
  const taggedAsActive = state.reach === REACH.NETWORK && profileTags.length > 0;

  return {
    ...(state as Partial<PersistedHomeState>),
    profileTags,
    taggedAsActive,
    hasUserSetReach: true,
  } as PersistedHomeState;
}
