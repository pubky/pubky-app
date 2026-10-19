import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockGrantReference } from '@/test-utils/pubky';
import { getShopReauthorizationIdentity } from './sign-in';

beforeEach(() => {
  useAuthStore.setState({
    ...authInitialState,
    generation: 'current',
    currentUserPubky: 'alice',
    sessionReference: mockGrantReference(),
  });
});
afterEach(() => {
  useAuthStore.setState(authInitialState);
  window.history.replaceState(null, '', '/');
});
describe('Shop reauthorization identity', () => {
  it('binds the original account for the current explicit Shop sign-in', () => {
    window.history.replaceState(null, '', '/sign-in?returnTo=%2Fshop%2Fmarketplace%2Fcart&shopReauth=current');
    expect(getShopReauthorizationIdentity()).toEqual({ expectedPubky: 'alice' });
  });
  it.each([
    '/sign-in',
    '/sign-in?returnTo=%2Fshop',
    '/sign-in?returnTo=%2Fshop&shopReauth=expired',
    '/sign-in?returnTo=%2Fprofile&shopReauth=current',
    '/onboarding?returnTo=%2Fshop&shopReauth=current',
  ])('keeps ordinary login unrestricted at %s', (path) => {
    window.history.replaceState(null, '', path);
    expect(getShopReauthorizationIdentity()).toEqual({});
  });
  it('does not constrain a genuinely signed-out visitor', () => {
    useAuthStore.setState({ currentUserPubky: null });
    window.history.replaceState(null, '', '/sign-in?returnTo=%2Fshop&shopReauth=current');
    expect(getShopReauthorizationIdentity()).toEqual({});
  });
  it('does not bind an abandoned signup draft as an authenticated account', () => {
    useAuthStore.setState({ currentUserPubky: 'draft', sessionReference: null, restoreStatus: 'idle' });
    window.history.replaceState(null, '', '/sign-in?returnTo=%2Fshop&shopReauth=current');
    expect(getShopReauthorizationIdentity()).toEqual({});
  });
});
