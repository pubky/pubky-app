import { describe, it, expect } from 'vitest';
import { Env } from './env';

/**
 * Tests for NEXT_PUBLIC_PKARR_RELAYS parsing
 *
 * The test config sets NEXT_PUBLIC_PKARR_RELAYS='["http://localhost:8080"]'
 * so we verify that the JSON array format is properly parsed.
 */
describe('NEXT_PUBLIC_PKARR_RELAYS parsing', () => {
  it('should parse PKARR_RELAYS as a string array', () => {
    expect(Array.isArray(Env.NEXT_PUBLIC_PKARR_RELAYS)).toBe(true);
  });

  it('should contain valid relay URLs', () => {
    for (const relay of Env.NEXT_PUBLIC_PKARR_RELAYS) {
      expect(typeof relay).toBe('string');
      // Should not throw when parsing as URL
      expect(() => new URL(relay)).not.toThrow();
    }
  });

  it('should match test config value', () => {
    // Test config sets: '["http://localhost:8080"]'
    expect(Env.NEXT_PUBLIC_PKARR_RELAYS).toEqual(['http://localhost:8080']);
  });
});

/**
 * Tests for environment variables configuration
 */
describe('Environment variables configuration', () => {
  it('should have valid values when explicitly set in test config', () => {
    // These are now REQUIRED variables (no defaults)
    // This test verifies they are set correctly in test.ts
    expect(Env.NEXT_PUBLIC_NEXUS_URL).toBeDefined();
    expect(Env.NEXT_PUBLIC_CDN_URL).toBeDefined();
    expect(Env.NEXT_PUBLIC_HOMEGATE_URL).toBeDefined();
    expect(Env.NEXT_PUBLIC_EXCHANGE_RATE_API).toBeDefined();
  });

  it('should have valid default values for optional metadata', () => {
    expect(Env.NEXT_PUBLIC_SITE_NAME).toBeDefined();
    expect(Env.NEXT_PUBLIC_PREVIEW_IMAGE).toBeDefined();
    expect(Env.NEXT_PUBLIC_LOCALE).toBeDefined();
  });

  it('should transform boolean strings correctly', () => {
    expect(typeof Env.NEXT_PUBLIC_DEBUG_MODE).toBe('boolean');
    expect(typeof Env.NEXT_PUBLIC_TESTNET).toBe('boolean');
    expect(typeof Env.NEXT_PUBLIC_NOTIFICATION_POLL_ON_START).toBe('boolean');
  });

  it('should transform number strings correctly', () => {
    expect(typeof Env.NEXT_PUBLIC_DB_VERSION).toBe('number');
    expect(typeof Env.NEXT_PUBLIC_TTL_POST_MS).toBe('number');
  });
});
