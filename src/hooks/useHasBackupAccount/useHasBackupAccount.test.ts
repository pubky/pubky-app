import { Keypair } from '@synonymdev/pubky';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { useHasBackupAccount } from './useHasBackupAccount';

describe('useHasBackupAccount', () => {
  const keypair = Keypair.random();
  const secretKey = Buffer.from(keypair.secret()).toString('hex');
  const attempt = { pubky: keypair.publicKey.z32(), homeserver: 'homeserver', environment: 'staging' };

  beforeEach(() => {
    useAuthStore.setState(authInitialState);
    useOnboardingStore.getState().reset();
    useOnboardingStore.setState({ secretKey });
  });

  it('is false for a generated pubky with no session and nothing to restore (#2955)', () => {
    useAuthStore.setState({ currentUserPubky: keypair.publicKey.z32() });
    expect(renderHook(() => useHasBackupAccount()).result.current).toBe(false);
  });

  it.each([
    { account: 'a ready session', state: { session: mockSession(), restoreStatus: 'ready' } },
    { account: 'a saved session pending restoration', state: { sessionReference: mockGrantReference() } },
    { account: 'a failed restore', state: { restoreStatus: 'reauth-required' } },
  ] as const)('is true for a member with $account', ({ state }) => {
    useAuthStore.setState({ currentUserPubky: keypair.publicKey.z32(), ...state });
    expect(renderHook(() => useHasBackupAccount()).result.current).toBe(true);
  });

  it('is true while a sign-up for the stored secret is recorded, even without a stored pubky', () => {
    useOnboardingStore.setState({ signupAttempt: { ...attempt, phase: 'created' } });
    expect(renderHook(() => useHasBackupAccount()).result.current).toBe(true);
  });

  it('is false when the recorded sign-up was for another key', () => {
    useOnboardingStore.setState({
      signupAttempt: { ...attempt, pubky: Keypair.random().publicKey.z32(), phase: 'created' },
    });
    expect(renderHook(() => useHasBackupAccount()).result.current).toBe(false);
  });
});
