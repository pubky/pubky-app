import { beforeEach, describe, expect, it } from 'vitest';
import { useSignInStore } from './signIn.store';

describe('SignInStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useSignInStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should have all flags set to false initially', () => {
      const state = useSignInStore.getState();

      expect(state.authUrlResolved).toBe(false);
      expect(state.profileChecked).toBe(false);
      expect(state.bootstrapFetched).toBe(false);
      expect(state.dataPersisted).toBe(false);
      expect(state.homeserverSynced).toBe(false);
    });
  });

  describe('Step Actions', () => {
    it('should set authUrlResolved to true', () => {
      useSignInStore.getState().setAuthUrlResolved(true);
      expect(useSignInStore.getState().authUrlResolved).toBe(true);
    });

    it('should set profileChecked to true', () => {
      useSignInStore.getState().setProfileChecked(true);
      expect(useSignInStore.getState().profileChecked).toBe(true);
    });

    it('should set bootstrapFetched to true', () => {
      useSignInStore.getState().setBootstrapFetched(true);
      expect(useSignInStore.getState().bootstrapFetched).toBe(true);
    });

    it('should set dataPersisted to true', () => {
      useSignInStore.getState().setDataPersisted(true);
      expect(useSignInStore.getState().dataPersisted).toBe(true);
    });

    it('should set homeserverSynced to true', () => {
      useSignInStore.getState().setHomeserverSynced(true);
      expect(useSignInStore.getState().homeserverSynced).toBe(true);
    });

    it('should track progress through all steps', () => {
      const store = useSignInStore.getState();

      store.setAuthUrlResolved(true);
      expect(useSignInStore.getState().authUrlResolved).toBe(true);

      store.setProfileChecked(true);
      expect(useSignInStore.getState().profileChecked).toBe(true);

      store.setBootstrapFetched(true);
      expect(useSignInStore.getState().bootstrapFetched).toBe(true);

      store.setDataPersisted(true);
      expect(useSignInStore.getState().dataPersisted).toBe(true);

      store.setHomeserverSynced(true);
      expect(useSignInStore.getState().homeserverSynced).toBe(true);
    });
  });

  describe('Reset', () => {
    it('should reset all state to initial values', () => {
      const store = useSignInStore.getState();

      // Set all state
      store.setAuthUrlResolved(true);
      store.setProfileChecked(true);
      store.setBootstrapFetched(true);
      store.setDataPersisted(true);
      store.setHomeserverSynced(true);

      // Reset
      store.reset();

      // Verify all reset
      const resetState = useSignInStore.getState();
      expect(resetState.authUrlResolved).toBe(false);
      expect(resetState.profileChecked).toBe(false);
      expect(resetState.bootstrapFetched).toBe(false);
      expect(resetState.dataPersisted).toBe(false);
      expect(resetState.homeserverSynced).toBe(false);
    });
  });
});
