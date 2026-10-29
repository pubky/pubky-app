import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ZustandGet } from '../stores.types';
import { AuthState, AuthStore } from './auth.types';

/**
 * Pure snapshot check: the user is authenticated when the snapshot holds a session.
 *
 * Use this — not `selectIsAuthenticated()` — when comparing `state` and `prevState`
 * inside a store subscriber. The selectors below close over the store's `get()`, so
 * `prevState.selectIsAuthenticated()` reads the *current* store and can never differ
 * from `state.selectIsAuthenticated()`; a transition compared that way is never seen.
 */
export const isAuthenticatedState = (state: Pick<AuthState, 'session'>): boolean => state.session !== null;

/**
 * Pure snapshot check: this browser holds an account — a session, a session reference to restore, or a
 * restore that is still running or needs recovery. A stored pubky alone is not one: the onboarding key step
 * stores a generated pubky before sign-up, and `useAuthStatus` treats that visitor as a guest.
 *
 * Surfaces that must stay for a member whose restore failed use this instead of `selectDisplayUserPubky`, which
 * also hides the identity after `reauth-required` / `temporary-error`; `docs/components.md` (Guest access) lists them.
 */
export const hasAccountState = (state: Pick<AuthState, 'session' | 'sessionReference' | 'restoreStatus'>): boolean =>
  state.session !== null || state.sessionReference !== null || state.restoreStatus !== 'idle';

/** The stored pubky while this browser holds an account (`hasAccountState`); null for a guest. Not an action guard. */
export const selectAccountUserPubky = (
  state: Pick<AuthState, 'currentUserPubky' | 'session' | 'sessionReference' | 'restoreStatus'>,
) => (hasAccountState(state) ? state.currentUserPubky : null);

/**
 * Preserve account chrome during restoration; show guest UI once restoration has failed. Not an action guard.
 *
 * A pubky without an account (`hasAccountState`) is a guest too: the onboarding key step stores a generated
 * pubky before sign-up, and `useAuthStatus` already treats that visitor as a guest.
 */
export const selectDisplayUserPubky = (
  state: Pick<AuthState, 'currentUserPubky' | 'session' | 'sessionReference' | 'restoreStatus'>,
) => {
  if (state.restoreStatus === 'reauth-required' || state.restoreStatus === 'temporary-error') return null;
  return selectAccountUserPubky(state);
};

// Selectors - State access functions with validation
export const createAuthSelectors = (get: ZustandGet<AuthStore>) => ({
  // call: useAuthStore((state) => state.selectCurrentUserPubky())
  selectCurrentUserPubky: () => {
    const pubky = get().currentUserPubky;
    if (pubky === null) {
      throw Err.auth(
        AuthErrorCode.UNAUTHORIZED,
        'Current user pubky is not available. User may not be authenticated.',
        {
          service: ErrorService.Local,
          operation: 'selectCurrentUserPubky',
        },
      );
    }
    return pubky;
  },

  /**
   * User is authenticated when they have a valid session
   */
  selectIsAuthenticated: () => isAuthenticatedState(get()),

  /**
   * Selects the current session
   */
  selectSession: () => get().session,
});
