import { describe, expect, it } from 'vitest';
import { mockRingSession } from '@/test-utils/pubky';
import { hasRequiredCapabilities, sessionNeedsUpgrade } from './capabilities';

const REQUIRED = '/pub/pubky.app/:rw,/priv/social/:rw,/priv/locks.app/:r';

describe('hasRequiredCapabilities', () => {
  it('accepts the exact list the app requests', () => {
    expect(hasRequiredCapabilities(['/pub/pubky.app/:rw', '/priv/social/:rw', '/priv/locks.app/:r'], REQUIRED)).toBe(
      true,
    );
  });

  it('accepts the root capability without a special case', () => {
    expect(hasRequiredCapabilities(['/:rw'], REQUIRED)).toBe(true);
  });

  it('accepts a broader directory scope and a superset of actions', () => {
    expect(hasRequiredCapabilities(['/pub/:rw', '/priv/:rw'], REQUIRED)).toBe(true);
  });

  it('rejects a session from before the /priv entries were requested', () => {
    expect(hasRequiredCapabilities(['/pub/pubky.app/:rw'], REQUIRED)).toBe(false);
  });

  it('rejects read-only where write is required', () => {
    expect(hasRequiredCapabilities(['/pub/pubky.app/:rw', '/priv/social/:r', '/priv/locks.app/:r'], REQUIRED)).toBe(
      false,
    );
  });

  it('treats a scope without a trailing slash as one path, not a prefix', () => {
    expect(hasRequiredCapabilities(['/priv/social:rw'], '/priv/social/:rw')).toBe(false);
    expect(hasRequiredCapabilities(['/pub/app:rw'], '/pub/app:rw')).toBe(true);
    expect(hasRequiredCapabilities(['/pub/app:rw'], '/pub/apple:rw')).toBe(false);
  });

  it('rejects an empty grant and ignores malformed granted entries', () => {
    expect(hasRequiredCapabilities([], REQUIRED)).toBe(false);
    expect(hasRequiredCapabilities(['garbage', '/:rw'], REQUIRED)).toBe(true);
  });

  it('tolerates spaces around required entries and either action order', () => {
    expect(hasRequiredCapabilities(['/:rw'], '/pub/:rw, /priv/:r')).toBe(true);
    expect(hasRequiredCapabilities(['/priv/:wr'], '/priv/x/:rw')).toBe(true);
  });
});

describe('sessionNeedsUpgrade', () => {
  it('is false without a session', () => {
    expect(sessionNeedsUpgrade(null)).toBe(false);
  });

  it('is false for a keypair (root) session', () => {
    expect(sessionNeedsUpgrade(mockRingSession(['/:rw']))).toBe(false);
  });

  it('is true for a Ring session minted with the pre-locks list', () => {
    expect(sessionNeedsUpgrade(mockRingSession(['/pub/pubky.app/:rw']))).toBe(true);
  });
});
