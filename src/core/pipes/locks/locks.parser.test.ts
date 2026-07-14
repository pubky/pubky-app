import { describe, expect, it } from 'vitest';
import { type LockFile, VerifierType } from '@/services/locks/locks.types';
import { LockContentParser, LockFileParser } from './locks.parser';

// TODO:[Locks] #1998 — inline test fixtures (sample lock file + author pubky) are
// duplicated across the lock tests; consider extracting a shared test util/fixture.
const MOCK_LOCK_AUTHOR_PUBKY = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const MOCK_LOCK_FILE: LockFile = {
  version: 1,
  creator: 'pubkycreator123',
  guarded_resource: {
    path: '/priv/locks.app/content/example.txt',
    hash: '<hash>',
    content_type: 'text/plain',
    size: 13,
  },
  criteria: [{ criterion_id: 'criterion-1', verifier_type: 'password', params: { satisfied: true } }],
  lock_logic: { type: 'all', criteria: ['criterion-1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: 'pubkyserver123' },
};

describe('LockContentParser', () => {
  describe('parse', () => {
    it('parses valid teaser content', () => {
      const content = JSON.stringify({
        lock_title: 'Private Key Management',
        teaser_description: 'Something, something, not your cheese.',
      });

      expect(LockContentParser.parse(content)).toEqual({
        lock_title: 'Private Key Management',
        teaser_description: 'Something, something, not your cheese.',
      });
    });

    it('returns null for empty content', () => {
      expect(LockContentParser.parse('')).toBeNull();
    });

    it('returns null for invalid or non-object JSON', () => {
      expect(LockContentParser.parse('not json')).toBeNull();
      expect(LockContentParser.parse('42')).toBeNull();
      expect(LockContentParser.parse('"hi"')).toBeNull();
    });

    it('defaults missing fields to empty strings', () => {
      expect(LockContentParser.parse(JSON.stringify({}))).toEqual({ lock_title: '', teaser_description: '' });
      expect(LockContentParser.parse(JSON.stringify({ lock_title: 'X' }))).toEqual({
        lock_title: 'X',
        teaser_description: '',
      });
    });
  });

  describe('isValidLockUrl', () => {
    it('accepts a pubky:// url with a valid pubky host', () => {
      expect(LockContentParser.isValidLockUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`)).toBe(true);
    });

    it('rejects non-pubky or malformed urls', () => {
      expect(LockContentParser.isValidLockUrl('https://example.com/lock.json')).toBe(false);
      expect(LockContentParser.isValidLockUrl('pubky://short/lock.json')).toBe(false);
      expect(LockContentParser.isValidLockUrl('')).toBe(false);
    });

    it('rejects a valid pubky url that does not point at a .json file', () => {
      expect(LockContentParser.isValidLockUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.txt`)).toBe(false);
      expect(LockContentParser.isValidLockUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/`)).toBe(false);
    });
  });
});

describe('LockFileParser', () => {
  describe('resolveVerifierType', () => {
    it('resolves password from the mock lock file', () => {
      expect(LockFileParser.resolveVerifierType(MOCK_LOCK_FILE)).toBe(VerifierType.PASSWORD);
    });

    it('resolves payment from a payment criterion', () => {
      const paymentLock = {
        ...MOCK_LOCK_FILE,
        criteria: [{ criterion_id: 'criterion-1', verifier_type: 'payment', params: {} }],
      };
      expect(LockFileParser.resolveVerifierType(paymentLock)).toBe(VerifierType.PAYMENT);
    });

    it('returns null for missing, empty or unsupported verifier types', () => {
      expect(LockFileParser.resolveVerifierType(null)).toBeNull();
      expect(LockFileParser.resolveVerifierType({ ...MOCK_LOCK_FILE, criteria: [] })).toBeNull();

      const devStaticLock = {
        ...MOCK_LOCK_FILE,
        criteria: [{ criterion_id: 'criterion-1', verifier_type: 'dev-static', params: {} }],
      };
      expect(LockFileParser.resolveVerifierType(devStaticLock)).toBeNull();
    });
  });
});
