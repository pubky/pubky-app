import { MIGRATION_CAPS } from 'pubky-social-specs/migration';
import { describe, expect, it } from 'vitest';
import { HOMESERVER_CAPABILITIES, SOCIAL_V1_CAPABILITIES } from '@/config/network';
import { mockRingSession } from '@/test-utils/pubky';
import { hasRequiredCapabilities, hasSocialV1Capabilities, sessionNeedsUpgrade } from './capabilities';

const REQUIRED = '/pub/pubky.app/:rw,/priv/social/:rw,/priv/app.locks/content/:r';

describe('hasRequiredCapabilities', () => {
  it('accepts the exact list the app requests', () => {
    expect(
      hasRequiredCapabilities(['/pub/pubky.app/:rw', '/priv/social/:rw', '/priv/app.locks/content/:r'], REQUIRED),
    ).toBe(true);
  });

  it('recognizes split read/write coverage so Locks does not ask for an unnecessary upgrade', () => {
    const capabilities = ['/pub/pubky.app/:rw', '/priv/:r', '/priv/social/:w'];
    expect(hasRequiredCapabilities(capabilities, REQUIRED)).toBe(true);
    expect(sessionNeedsUpgrade(mockRingSession(capabilities))).toBe(false);
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
    expect(
      hasRequiredCapabilities(['/pub/pubky.app/:rw', '/priv/social/:r', '/priv/app.locks/content/:r'], REQUIRED),
    ).toBe(false);
  });

  it('treats a scope without a trailing slash as one path, not a prefix', () => {
    expect(hasRequiredCapabilities(['/priv/social:rw'], '/priv/social/:rw')).toBe(false);
    expect(hasRequiredCapabilities(['/pub/app:rw'], '/pub/app:rw')).toBe(true);
    expect(hasRequiredCapabilities(['/pub/app:rw'], '/pub/apple:rw')).toBe(false);
  });

  it('rejects empty or malformed grants', () => {
    expect(hasRequiredCapabilities([], REQUIRED)).toBe(false);
    expect(hasRequiredCapabilities(['garbage', '/:rw'], REQUIRED)).toBe(false);
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

  it('is true for a Ring session minted with the retired locks.app scope', () => {
    expect(sessionNeedsUpgrade(mockRingSession(['/pub/pubky.app/:rw', '/priv/social/:rw', '/priv/locks.app/:r']))).toBe(
      true,
    );
  });
});

describe('hasSocialV1Capabilities', () => {
  it('is false without a session', () => {
    expect(hasSocialV1Capabilities(null)).toBe(false);
  });

  it('is true for a keypair (root) session', () => {
    expect(hasSocialV1Capabilities(mockRingSession(['/:rw']))).toBe(true);
  });

  it("is false for a Ring session minted with today's list, which lacks the public v1 tree and the app's own files", () => {
    expect(
      hasSocialV1Capabilities(
        mockRingSession(['/pub/pubky.app/:rw', '/priv/social/:rw', '/priv/app.locks/content/:r']),
      ),
    ).toBe(false);
  });

  it('is true once the migration grant was approved, with or without the locks entries', () => {
    const migration = ['/pub/social/v1/:rw', '/priv/social/v1/:rw', '/priv/app.pubky/v1/:rw', '/pub/pubky.app/:rw'];
    expect(hasSocialV1Capabilities(mockRingSession(migration))).toBe(true);
    expect(
      hasSocialV1Capabilities(mockRingSession([...migration, '/priv/social/:rw', '/priv/app.locks/content/:r'])),
    ).toBe(true);
  });

  it('is false when the legacy tree is read-only, since deleting a migrated object still reaches it', () => {
    expect(
      hasSocialV1Capabilities(
        mockRingSession(['/pub/social/v1/:rw', '/priv/social/v1/:rw', '/priv/app.pubky/v1/:rw', '/pub/pubky.app/:r']),
      ),
    ).toBe(false);
  });
});

describe('the social v1 grant', () => {
  it('is spelled as the package spells the migration grant', () => {
    expect(SOCIAL_V1_CAPABILITIES).toBe(MIGRATION_CAPS);
  });

  it('is covered by the grant every session asks for', () => {
    expect(hasRequiredCapabilities(HOMESERVER_CAPABILITIES.split(','), SOCIAL_V1_CAPABILITIES)).toBe(true);
  });
});
