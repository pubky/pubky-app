import { describe, expect, it } from 'vitest';
import { Env } from './env';

/**
 * Tests for the build-time environment schema.
 *
 * Only build-intrinsic public values and server-only variables live in `Env`. Everything
 * runtime-configurable is covered by src/libs/runtime-config/runtime-config.schema.test.ts.
 */
describe('Environment variables configuration', () => {
  it('should transform boolean strings correctly', () => {
    expect(typeof Env.NEXT_PUBLIC_DEBUG_MODE).toBe('boolean');
  });

  it('should transform number strings correctly', () => {
    expect(typeof Env.NEXT_PUBLIC_DB_VERSION).toBe('number');
  });

  it('should expose the build-intrinsic values set by the test config', () => {
    expect(Env.NEXT_PUBLIC_DB_NAME).toBeDefined();
    expect(Env.NEXT_PUBLIC_APP_VERSION).toBe('0.0.0-test');
  });

  it('should expose server-only Chatwoot credentials from the test config', () => {
    expect(Env.BASE_URL_SUPPORT).toBeDefined();
    expect(Env.SUPPORT_API_ACCESS_TOKEN).toBeDefined();
    expect(Env.SUPPORT_ACCOUNT_ID).toBeDefined();
  });

  it('should parse NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS as a non-empty string array', () => {
    expect(Array.isArray(Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS)).toBe(true);
    expect(Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS.length).toBeGreaterThan(0);
    expect(Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS).toContain('https://vibes.pubky.app');
    expect(Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS).toContain('https://*.vibes.pubky.app');
    expect(Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS).toContain('https://shop.pubky.app');
    expect(Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS).toContain('https://vibes.staging.pubky.app');
  });
});

describe('session bridge allowlist env validation', () => {
  it('rejects invalid allowlist entries at parse time', async () => {
    const { parseSessionBridgeAllowlist } = await import('@/libs/session-bridge/allowlist');
    expect(() => parseSessionBridgeAllowlist('*')).toThrow(
      'Invalid NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS entries: *',
    );
  });
});
