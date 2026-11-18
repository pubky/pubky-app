import { beforeEach, describe, expect, it } from 'vitest';
import { ONBOARDING_PERSIST_KEY } from '../persistedKeys';
import { ONBOARDING_STORE_VERSION } from './onboarding.migrations';
import { useOnboardingStore } from './onboarding.store';
import { onboardingInitialState } from './onboarding.types';

describe('OnboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState(onboardingInitialState);
  });

  describe('State Management', () => {
    it('clears completion only for the deleted profile', () => {
      useOnboardingStore.getState().markExperienceCompleted('first-pubky');
      useOnboardingStore.getState().markExperienceCompleted('second-pubky');
      useOnboardingStore.getState().clearExperienceCompleted('first-pubky');

      expect(useOnboardingStore.getState().experienceCompletedByPubky).toEqual({ 'second-pubky': true });
    });

    it('leaves existing completion entries intact when clearing an unknown profile', () => {
      useOnboardingStore.getState().markExperienceCompleted('known-pubky');
      useOnboardingStore.getState().clearExperienceCompleted('unknown-pubky');

      expect(useOnboardingStore.getState().experienceCompletedByPubky).toEqual({ 'known-pubky': true });
    });

    it('sets the hydrated state and keeps it through a reset', () => {
      useOnboardingStore.getState().setHydrated(true);
      useOnboardingStore.getState().setInviteCode('ABCD-EFGH-IJKL');

      useOnboardingStore.getState().reset();

      expect(useOnboardingStore.getState().hasHydrated).toBe(true);
      expect(useOnboardingStore.getState().inviteCode).toBe('');
    });

    it('sets and resets the welcome dialog flag', () => {
      useOnboardingStore.getState().setShowWelcomeDialog(true);
      expect(useOnboardingStore.getState().showWelcomeDialog).toBe(true);

      useOnboardingStore.getState().reset();
      expect(useOnboardingStore.getState().showWelcomeDialog).toBe(false);
    });
  });

  describe('Persistence', () => {
    it('persists no key material, at the version that deletes what earlier versions stored', () => {
      const { partialize, version } = useOnboardingStore.persist.getOptions();
      useOnboardingStore.setState({ inviteCode: 'ABCD-EFGH-IJKL', interestTags: ['bitcoin'] });

      expect(version).toBe(ONBOARDING_STORE_VERSION);
      expect(partialize?.(useOnboardingStore.getState())).toEqual({
        showWelcomeDialog: false,
        inviteCode: 'ABCD-EFGH-IJKL',
        interestTags: ['bitcoin'],
        experienceCompletedByPubky: {},
        hasHydrated: false,
      });
    });

    it('rewrites a version 0 store without the browser key on the next load', async () => {
      const secretKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      window.localStorage.setItem(
        ONBOARDING_PERSIST_KEY,
        JSON.stringify({
          state: { secretKey, mnemonic: 'abandon about', signupAttempt: null, inviteCode: 'ABCD-EFGH-IJKL' },
          version: 0,
        }),
      );

      await useOnboardingStore.persist.rehydrate();

      const stored = window.localStorage.getItem(ONBOARDING_PERSIST_KEY) ?? '';
      expect(stored).not.toContain(secretKey);
      expect(stored).not.toContain('mnemonic');
      expect(JSON.parse(stored)).toMatchObject({ state: { inviteCode: 'ABCD-EFGH-IJKL' }, version: 1 });
      expect(useOnboardingStore.getState()).not.toHaveProperty('secretKey');
      window.localStorage.removeItem(ONBOARDING_PERSIST_KEY);
    });
  });

  describe('Interest Tags', () => {
    it('should have empty interestTags by default', () => {
      expect(useOnboardingStore.getState().interestTags).toEqual([]);
    });

    it('should set interest tags preserving order', () => {
      useOnboardingStore.getState().setInterestTags(['bitcoin', 'art', 'photography']);

      expect(useOnboardingStore.getState().interestTags).toEqual(['bitcoin', 'art', 'photography']);
    });

    it('should replace previous interest tags on set', () => {
      const state = useOnboardingStore.getState();
      state.setInterestTags(['bitcoin']);
      state.setInterestTags(['art', 'music']);

      expect(useOnboardingStore.getState().interestTags).toEqual(['art', 'music']);
    });

    it('should clear interestTags on reset to prevent cross-account leakage', () => {
      useOnboardingStore.getState().setInterestTags(['bitcoin', 'art']);

      useOnboardingStore.getState().reset();

      expect(useOnboardingStore.getState().interestTags).toEqual([]);
    });
  });

  describe('Experience Completion (per pubky)', () => {
    const pubkyA = 'pubky-user-a';
    const pubkyB = 'pubky-user-b';

    it('should have empty completion map by default', () => {
      expect(useOnboardingStore.getState().experienceCompletedByPubky).toEqual({});
    });

    it('should mark completion for a specific pubky only', () => {
      useOnboardingStore.getState().markExperienceCompleted(pubkyA);

      const state = useOnboardingStore.getState();
      expect(state.experienceCompletedByPubky[pubkyA]).toBe(true);
      expect(state.experienceCompletedByPubky[pubkyB]).toBeUndefined();
    });

    it('should accumulate completion across multiple pubkys', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);
      state.markExperienceCompleted(pubkyB);

      const finalState = useOnboardingStore.getState();
      expect(finalState.experienceCompletedByPubky[pubkyA]).toBe(true);
      expect(finalState.experienceCompletedByPubky[pubkyB]).toBe(true);
    });

    it('should preserve completion through reset (same-account logout/re-login)', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);

      // Logout and sign-in both call reset()
      state.reset();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[pubkyA]).toBe(true);
    });

    it('should not flag a different account on the same browser after reset', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);

      state.reset();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[pubkyB]).toBeUndefined();
    });

    it('should survive repeated resets', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);

      state.reset();
      state.reset();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[pubkyA]).toBe(true);
    });
  });
});
