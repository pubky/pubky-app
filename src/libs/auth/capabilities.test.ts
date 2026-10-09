import { describe, expect, it } from 'vitest';
import { hasCapabilities } from './capabilities';

describe('hasCapabilities', () => {
  it('accepts a root session for the Locks permissions', () => {
    expect(hasCapabilities(['/:rw'], ['/priv/social/:rw', '/priv/locks.app/:r'])).toBe(true);
  });

  it.each([
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
