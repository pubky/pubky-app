import { ZustandGet } from '../stores.types';
import { AuthStore } from './auth.types';

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
  selectIsAuthenticated: () => {
    const state = get();
    return state.session !== null;
  },

  /**
   * Selects the current session
   */
  selectSession: () => get().session,
});
