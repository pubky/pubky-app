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

// Selectors - State access functions with validation
export const createAuthSelectors = (get: ZustandGet<AuthStore>) => ({
  // call: useAuthStore((state) => state.selectCurrentUserPubky())
  selectCurrentUserPubky: () => {
    const pubky = get().currentUserPubky;
    if (pubky === null) {
      throw new Error('Current user pubky is not available. User may not be authenticated.');
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
