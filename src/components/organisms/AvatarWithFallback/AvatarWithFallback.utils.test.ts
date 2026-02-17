import { describe, it, expect, vi } from 'vitest';
import {
  extractUserIdFromAvatarUrl,
  resolveAvatarFallbackSeed,
  resolveAvatarFallbackInitial,
} from './AvatarWithFallback.utils';

// Mock the config module
vi.mock('@/config', () => ({
  CDN_URL: 'https://nexus.staging.pubky.app/static',
}));

describe('extractUserIdFromAvatarUrl', () => {
  // Valid 52-character lowercase alphanumeric userId
  const VALID_USER_ID = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
  const CDN_URL = 'https://nexus.staging.pubky.app/static';

  describe('valid URLs', () => {
    it('extracts userId from a valid avatar URL', () => {
      const url = `${CDN_URL}/avatar/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(VALID_USER_ID);
    });

    it('extracts userId from URL with query parameters', () => {
      const url = `${CDN_URL}/avatar/${VALID_USER_ID}?v=12345`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(VALID_USER_ID);
    });

    it('extracts userId from URL with multiple query parameters', () => {
      const url = `${CDN_URL}/avatar/${VALID_USER_ID}?v=12345&size=large&format=webp`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(VALID_USER_ID);
    });

    it('handles userId with all lowercase letters', () => {
      const letterOnlyId = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
      const url = `${CDN_URL}/avatar/${letterOnlyId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(letterOnlyId);
    });

    it('handles userId with all numbers', () => {
      const numberOnlyId = '1234567890123456789012345678901234567890123456789012';
      const url = `${CDN_URL}/avatar/${numberOnlyId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(numberOnlyId);
    });

    it('handles userId with mixed letters and numbers', () => {
      const mixedId = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';
      const url = `${CDN_URL}/avatar/${mixedId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(mixedId);
    });
  });

  describe('null/undefined/empty input', () => {
    it('returns null for undefined input', () => {
      expect(extractUserIdFromAvatarUrl(undefined)).toBeNull();
    });

    it('returns null for null input', () => {
      expect(extractUserIdFromAvatarUrl(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractUserIdFromAvatarUrl('')).toBeNull();
    });
  });

  describe('invalid URL prefix', () => {
    it('returns null for URL with wrong domain', () => {
      const url = `https://other-domain.com/static/avatar/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for URL with wrong path', () => {
      const url = `${CDN_URL}/profile/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for URL without avatar path', () => {
      const url = `${CDN_URL}/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for URL with http instead of https', () => {
      const url = `http://nexus.staging.pubky.app/static/avatar/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for relative URL', () => {
      const url = `/avatar/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for URL with extra path segments before avatar', () => {
      const url = `${CDN_URL}/users/avatar/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });
  });

  describe('invalid userId format', () => {
    it('returns null for userId that is too short (51 characters)', () => {
      const shortId = 'a'.repeat(51);
      const url = `${CDN_URL}/avatar/${shortId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for userId that is too long (53 characters)', () => {
      const longId = 'a'.repeat(53);
      const url = `${CDN_URL}/avatar/${longId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for userId with uppercase letters', () => {
      const upperCaseId = '6MFXOZZQMB36RC9RGY3RYKOYFGHFAO74N8IGT5TF1BOEHPROAHOY';
      const url = `${CDN_URL}/avatar/${upperCaseId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for userId with mixed case letters', () => {
      const mixedCaseId = '6mfxOzzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
      const url = `${CDN_URL}/avatar/${mixedCaseId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for userId with special characters', () => {
      const specialCharId = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehpro_hoy';
      const url = `${CDN_URL}/avatar/${specialCharId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for userId with hyphens', () => {
      const hyphenId = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehpro-hoy';
      const url = `${CDN_URL}/avatar/${hyphenId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for empty userId', () => {
      const url = `${CDN_URL}/avatar/`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for userId with spaces', () => {
      const spaceId = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehpro hoy';
      const url = `${CDN_URL}/avatar/${spaceId}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for URL that is just the prefix', () => {
      const url = `${CDN_URL}/avatar/`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for URL with trailing slash after userId', () => {
      // The trailing slash would make the userId portion include the slash
      // which would fail the pattern validation
      const url = `${CDN_URL}/avatar/${VALID_USER_ID}/`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('returns null for URL with additional path after userId', () => {
      const url = `${CDN_URL}/avatar/${VALID_USER_ID}/extra/path`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });

    it('correctly extracts userId when query param contains valid userId pattern', () => {
      // Query params should be stripped, only the path portion matters
      const url = `${CDN_URL}/avatar/${VALID_USER_ID}?other=abc123`;
      expect(extractUserIdFromAvatarUrl(url)).toBe(VALID_USER_ID);
    });

    it('returns null for non-URL string', () => {
      expect(extractUserIdFromAvatarUrl('not a url')).toBeNull();
    });

    it('returns null for URL-like string without protocol', () => {
      const url = `nexus.staging.pubky.app/static/avatar/${VALID_USER_ID}`;
      expect(extractUserIdFromAvatarUrl(url)).toBeNull();
    });
  });
});

describe('resolveAvatarFallbackSeed', () => {
  const validUserId = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';

  it('uses explicit fallbackSeed first', () => {
    expect(
      resolveAvatarFallbackSeed({
        fallbackSeed: 'explicit-seed',
        userId: validUserId,
        name: 'John Doe',
      }),
    ).toBe('explicit-seed');
  });

  it('uses userId when fallbackSeed is missing', () => {
    expect(
      resolveAvatarFallbackSeed({
        userId: validUserId,
        name: 'John Doe',
      }),
    ).toBe(validUserId);
  });

  it('uses name when fallbackSeed and userId are missing', () => {
    expect(
      resolveAvatarFallbackSeed({
        name: 'Jane Doe',
      }),
    ).toBe('Jane Doe');
  });

  it('falls back to default seed when no fallbackSeed, no userId, and no name', () => {
    expect(
      resolveAvatarFallbackSeed({
        name: '',
      }),
    ).toBe('user');
  });
});

describe('resolveAvatarFallbackInitial', () => {
  it('uses name initial when name exists', () => {
    expect(resolveAvatarFallbackInitial({ name: 'John Doe', seed: 'abc' })).toBe('J');
  });

  it('uses seed initial when name is missing', () => {
    expect(resolveAvatarFallbackInitial({ name: '', seed: 'seed-value' })).toBe('S');
  });

  it('falls back to default initial when name and seed are missing', () => {
    expect(resolveAvatarFallbackInitial({ name: '', seed: '' })).toBe('U');
  });
});
