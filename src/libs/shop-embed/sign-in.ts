import { AUTH_ROUTES } from '@/app/routes';
import { isShopReauthorization } from '@/libs/shop-embed/bridge';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Bind a Shop reauthorization before starting any signer or asynchronous key recovery. */
export function getShopReauthorizationIdentity(): { expectedPubky?: string } {
  if (typeof window === 'undefined' || window.location.pathname !== AUTH_ROUTES.SIGN_IN) return {};
  const state = useAuthStore.getState();
  const hasAccount = state.sessionReference !== null || state.restoreStatus === 'reauth-required';
  return state.currentUserPubky && hasAccount && isShopReauthorization(window.location.search, state.generation)
    ? { expectedPubky: state.currentUserPubky }
    : {};
}
