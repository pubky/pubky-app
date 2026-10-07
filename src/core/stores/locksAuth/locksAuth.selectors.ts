import { ZustandGet } from '../stores.types';
import { LocksAuthStore } from './locksAuth.types';

/**
 * Authenticated to the Lock Server when a live session is held. Exported so a component
 * subscribing to `session` reactively answers the question the same way this store does.
 */
export const isLocksAuthenticated = (session: LocksAuthStore['session']) => session !== null;

export const createLocksAuthSelectors = (get: ZustandGet<LocksAuthStore>) => ({
  selectIsLocksAuthenticated: () => isLocksAuthenticated(get().session),
  selectLocksSession: () => get().session,
  selectLocksSessionSecret: () => get().locksSessionSecret,
  selectIsPaykitConnected: () => get().paykitConnected,
});
