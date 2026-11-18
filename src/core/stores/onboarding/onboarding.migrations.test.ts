import { describe, expect, it } from 'vitest';
import { migrateOnboardingPersistedState, ONBOARDING_STORE_VERSION } from './onboarding.migrations';

const VERSION_0_STATE = {
  signupAttempt: { pubky: 'alicepubky', homeserver: 'homeserver', environment: 'staging', phase: 'created' },
  secretKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  showWelcomeDialog: true,
  inviteCode: 'ABCD-EFGH-IJKL',
  interestTags: ['bitcoin'],
  experienceCompletedByPubky: { alicepubky: true },
  hasHydrated: false,
};

describe('migrateOnboardingPersistedState', () => {
  it('deletes the key, phrase and sign-up attempt a version 0 store kept, and nothing else', () => {
    expect(migrateOnboardingPersistedState(VERSION_0_STATE, 0)).toEqual({
      showWelcomeDialog: true,
      inviteCode: 'ABCD-EFGH-IJKL',
      interestTags: ['bitcoin'],
      experienceCompletedByPubky: { alicepubky: true },
      hasHydrated: false,
    });
  });

  it('does not change the stored value it was given', () => {
    migrateOnboardingPersistedState(VERSION_0_STATE, 0);

    expect(VERSION_0_STATE.secretKey).toBeDefined();
  });

  it('keeps a current-version store as stored', () => {
    const current = { inviteCode: 'ABCD-EFGH-IJKL', interestTags: [] };

    expect(migrateOnboardingPersistedState(current, ONBOARDING_STORE_VERSION)).toEqual(current);
  });

  it('starts from an empty store when the stored value is not an object', () => {
    expect(migrateOnboardingPersistedState(null, 0)).toEqual({});
    expect(migrateOnboardingPersistedState('corrupted', 0)).toEqual({});
  });
});
