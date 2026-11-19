import { describe, expect, it } from 'vitest';
import { DM_CAPABILITIES, LOCKS_CAPABILITIES } from '@/config/auth';
import { hasCapabilities, requestsEncryptionKeys } from './capabilities';

describe('hasCapabilities', () => {
  it('accepts a root session for the Locks permissions', () => {
    expect(hasCapabilities(['/:rw'], ['/priv/social/:rw', '/priv/locks.app/:r'])).toBe(true);
  });

  it('accepts a root grant with encryption and read/write permissions for Locks', () => {
    expect(hasCapabilities(['/:rwe'], LOCKS_CAPABILITIES)).toBe(true);
  });

  it.each([
    { granted: ['/:e'], required: ['/pub/pubky.app/:rw'], covered: false },
    { granted: ['/pub/pubky.app/:e'], required: ['/pub/pubky.app/:rw'], covered: false },
    { granted: ['/pub/pubky.app/:rw'], required: ['/priv/social/:rw'], covered: false },
    { granted: ['/priv/social/:rw'], required: ['/priv/social/item:r'], covered: true },
    { granted: ['/priv/social/:r'], required: ['/priv/social/:rw'], covered: false },
    { granted: ['/priv/social/:w'], required: ['/priv/social/item:r'], covered: false },
    { granted: ['/priv/social:r'], required: ['/priv/social/item:r'], covered: false },
    { granted: ['/priv/social:r'], required: ['/priv/social:r'], covered: true },
    { granted: ['/priv/social/:r'], required: ['/priv/social:r'], covered: false },
    { granted: ['/priv/social/:r'], required: ['/priv/social-evil/item:r'], covered: false },
    { granted: ['/priv/social/:r'], required: ['/priv/social2/:r'], covered: false },
    { granted: ['/priv/social/:r'], required: ['/priv/:r'], covered: false },
    { granted: ['/priv/social/item:rw'], required: ['/priv/social/:r'], covered: false },
    { granted: ['/priv/social/:r', '/priv/social/:w'], required: ['/priv/social/:rw'], covered: true },
    { granted: ['/priv/:r', '/priv/social/:w'], required: ['/priv/social/:rw'], covered: true },
    { granted: ['/priv/social/:wr'], required: ['/priv/social/:rw'], covered: true },
    { granted: [], required: ['/priv/social/:r'], covered: false },
    { granted: [], required: [], covered: true },
  ])('$granted covers $required: $covered', ({ granted, required, covered }) => {
    expect(hasCapabilities(granted, required)).toBe(covered);
  });

  it.each([
    '/priv/social/:x',
    '/priv/social/:',
    '/priv/social/',
    'priv/social/:rw',
    '/priv//social/:rw',
    '/priv/social/../:rw',
  ])('rejects malformed capabilities using the real SDK parser: %s', (invalid) => {
    expect(hasCapabilities([invalid], ['/priv/social/:r'])).toBe(false);
    expect(hasCapabilities(['/:rw'], [invalid])).toBe(false);
  });

  it('requires both Locks scopes', () => {
    const required = ['/priv/social/:rw', '/priv/locks.app/:r'];
    expect(hasCapabilities(['/priv/social/:rw'], required)).toBe(false);
    expect(hasCapabilities(required, required)).toBe(true);
  });
});

describe('requestsEncryptionKeys', () => {
  it('is true when any scope asks for the e action', () => {
    expect(requestsEncryptionKeys(DM_CAPABILITIES.join(','))).toBe(true);
    expect(requestsEncryptionKeys('/pub/pubky.app/:rw,/priv/example/:rwe')).toBe(true);
  });

  it('is false for read and write scopes only', () => {
    expect(requestsEncryptionKeys('/pub/pubky.app/:rw,/priv/social/:rw')).toBe(false);
    expect(requestsEncryptionKeys(LOCKS_CAPABILITIES.join(','))).toBe(false);
  });

  it('is false for malformed input', () => {
    expect(requestsEncryptionKeys('not a capability')).toBe(false);
  });
});

describe('hasCapabilities with encryption scopes', () => {
  it('covers the messaging key file from an approved e scope', () => {
    expect(hasCapabilities([...DM_CAPABILITIES], [...DM_CAPABILITIES])).toBe(true);
  });

  it('does not treat read and write as an encryption approval', () => {
    expect(hasCapabilities(['/pub/private_messages/:rw', '/priv/private_messages/:rw'], [...DM_CAPABILITIES])).toBe(
      false,
    );
  });
});
