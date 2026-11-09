import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import { hasSignupAttemptForSecretState } from './onboarding.selectors';

describe('hasSignupAttemptForSecretState', () => {
  const keypair = Keypair.random();
  const secretKey = Buffer.from(keypair.secret()).toString('hex');
  const attempt = { pubky: keypair.publicKey.z32(), homeserver: 'homeserver', environment: 'staging' };

  it.each(['creating', 'created'] as const)('is true while a sign-up for the stored secret is %s', (phase) => {
    expect(hasSignupAttemptForSecretState({ secretKey, signupAttempt: { ...attempt, phase } })).toBe(true);
  });

  it('is false without a stored secret', () => {
    expect(hasSignupAttemptForSecretState({ secretKey: null, signupAttempt: { ...attempt, phase: 'created' } })).toBe(
      false,
    );
  });

  it('is false without a sign-up attempt', () => {
    expect(hasSignupAttemptForSecretState({ secretKey, signupAttempt: null })).toBe(false);
  });

  it('is false when the sign-up was for another key', () => {
    const other = Buffer.from(Keypair.random().secret()).toString('hex');
    expect(hasSignupAttemptForSecretState({ secretKey: other, signupAttempt: { ...attempt, phase: 'created' } })).toBe(
      false,
    );
  });

  it('is false for a malformed secret', () => {
    expect(
      hasSignupAttemptForSecretState({ secretKey: 'not-a-secret', signupAttempt: { ...attempt, phase: 'created' } }),
    ).toBe(false);
  });
});
