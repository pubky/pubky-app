import { type HomeState, REACH } from './home.types';

export const HOME_STORE_VERSION = 1;

type PersistedHomeState = Omit<HomeState, 'hasHydrated'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReach(value: unknown): value is HomeState['reach'] {
  return typeof value === 'string' && Object.values<string>(REACH).includes(value);
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
  const persistedReach = isReach(state.reach) ? state.reach : undefined;
  const taggedAsActive = persistedReach === REACH.NETWORK && profileTags.length > 0;
  const stateWithoutReach = { ...state };
  delete stateWithoutReach.reach;

  return {
    ...(stateWithoutReach as Partial<PersistedHomeState>),
    ...(persistedReach ? { reach: persistedReach } : {}),
    profileTags,
    taggedAsActive,
    hasUserSetReach: persistedReach !== undefined,
  } as PersistedHomeState;
}
