import { describe, expect, it } from 'vitest';
import {
  buildSessionBridgeFrameAncestors,
  buildSessionBridgeRouteHeaders,
  DEFAULT_SESSION_BRIDGE_ALLOWED_ORIGINS,
  defaultSessionBridgeAllowedOrigins,
  formatInvalidSessionBridgeAllowlistError,
  isAllowedBridgeOrigin,
  parseSessionBridgeAllowlist,
  resolveSessionBridgeAllowlistInput,
  SESSION_BRIDGE_DEV_LOOPBACK_ORIGIN,
  SESSION_BRIDGE_PROD_DEFAULT_ORIGINS,
  SESSION_BRIDGE_STAGING_DEFAULT_ORIGINS,
  validateSessionBridgeAllowlistEntry,
} from './allowlist';

const allowlist = parseSessionBridgeAllowlist(DEFAULT_SESSION_BRIDGE_ALLOWED_ORIGINS);

describe('defaultSessionBridgeAllowedOrigins', () => {
  it('uses production board hosts and first-party exact origins in production', () => {
    expect(defaultSessionBridgeAllowedOrigins('production')).toBe(SESSION_BRIDGE_PROD_DEFAULT_ORIGINS);
    expect(defaultSessionBridgeAllowedOrigins('production').split(',')).toEqual([
      'https://vibes.pubky.app',
      'https://*.vibes.pubky.app',
      'https://shop.pubky.app',
    ]);
    expect(defaultSessionBridgeAllowedOrigins('production')).not.toContain('localhost');
    expect(defaultSessionBridgeAllowedOrigins('production')).not.toContain('vibes.staging.pubky.app');
  });

  it('includes the first-party shop origin in production and non-production', () => {
    expect(defaultSessionBridgeAllowedOrigins('production').split(',')).toContain('https://shop.pubky.app');
    expect(defaultSessionBridgeAllowedOrigins('development').split(',')).toContain('https://shop.pubky.app');
    expect(SESSION_BRIDGE_PROD_DEFAULT_ORIGINS.split(',')).toContain('https://shop.pubky.app');
    expect(SESSION_BRIDGE_PROD_DEFAULT_ORIGINS).not.toContain('https://*.pubky.app');
  });

  it('adds staging board hosts and loopback only outside production', () => {
    expect(defaultSessionBridgeAllowedOrigins('development')).toBe(
      `${SESSION_BRIDGE_PROD_DEFAULT_ORIGINS},${SESSION_BRIDGE_STAGING_DEFAULT_ORIGINS},${SESSION_BRIDGE_DEV_LOOPBACK_ORIGIN}`,
    );
    expect(defaultSessionBridgeAllowedOrigins('test').split(',')).toEqual([
      'https://vibes.pubky.app',
      'https://*.vibes.pubky.app',
      'https://shop.pubky.app',
      'https://vibes.staging.pubky.app',
      'https://*.vibes.staging.pubky.app',
      'http://localhost:3000',
    ]);
    expect(defaultSessionBridgeAllowedOrigins('test')).toContain(SESSION_BRIDGE_DEV_LOOPBACK_ORIGIN);
  });
});

describe('parseSessionBridgeAllowlist', () => {
  it('splits comma-separated origins and trims whitespace', () => {
    expect(parseSessionBridgeAllowlist(' https://a.example ,https://b.example, ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('treats empty and whitespace-only env as the NODE_ENV default', () => {
    expect(resolveSessionBridgeAllowlistInput('')).toBe(defaultSessionBridgeAllowedOrigins());
    expect(resolveSessionBridgeAllowlistInput('   ')).toBe(defaultSessionBridgeAllowedOrigins());
    expect(parseSessionBridgeAllowlist('')).toEqual(parseSessionBridgeAllowlist(undefined));
    expect(parseSessionBridgeAllowlist(null, 'production')).toEqual(
      parseSessionBridgeAllowlist(SESSION_BRIDGE_PROD_DEFAULT_ORIGINS),
    );
  });

  it('throws listing invalid entries', () => {
    expect(() => parseSessionBridgeAllowlist('*')).toThrow(formatInvalidSessionBridgeAllowlistError(['*']));
    expect(() => parseSessionBridgeAllowlist('https://evil.example/path,https://*.x@evil.com')).toThrow(
      formatInvalidSessionBridgeAllowlistError(['https://evil.example/path', 'https://*.x@evil.com']),
    );
  });
});

describe('validateSessionBridgeAllowlistEntry', () => {
  it('accepts exact https origins and https wildcards with a bare suffix', () => {
    expect(validateSessionBridgeAllowlistEntry('https://vibes.pubky.app')).toBe(true);
    expect(validateSessionBridgeAllowlistEntry('https://*.vibes.pubky.app')).toBe(true);
  });

  it('accepts loopback http including IPv6', () => {
    expect(validateSessionBridgeAllowlistEntry('http://localhost:3000')).toBe(true);
    expect(validateSessionBridgeAllowlistEntry('http://127.0.0.1:3000')).toBe(true);
    expect(validateSessionBridgeAllowlistEntry('http://[::1]:3000')).toBe(true);
  });

  it('rejects wildcard with a non-default port', () => {
    expect(validateSessionBridgeAllowlistEntry('https://*.vibes.pubky.app:8443')).toBe(false);
  });

  it('rejects wildcard with userinfo', () => {
    expect(validateSessionBridgeAllowlistEntry('https://*.x@evil.com')).toBe(false);
  });

  it('rejects an exact entry with a path', () => {
    expect(validateSessionBridgeAllowlistEntry('https://vibes.pubky.app/foo')).toBe(false);
  });

  it('rejects a global wildcard and non-loopback http', () => {
    expect(validateSessionBridgeAllowlistEntry('*')).toBe(false);
    expect(validateSessionBridgeAllowlistEntry('http://evil.com')).toBe(false);
  });

  it('requires punycode for IDN exact entries', () => {
    const unicode = 'https://vibes.pükky.app';
    const punycodeOrigin = new URL(unicode).origin;
    expect(validateSessionBridgeAllowlistEntry(unicode)).toBe(false);
    expect(validateSessionBridgeAllowlistEntry(punycodeOrigin)).toBe(true);
  });
});

describe('isAllowedBridgeOrigin', () => {
  it('allows exact production board origin', () => {
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app', allowlist)).toBe(true);
  });

  it('rejects a suffix-spoofed vibes board host and http on the board', () => {
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app.evil.com', allowlist)).toBe(false);
    expect(isAllowedBridgeOrigin('http://vibes.pubky.app', allowlist)).toBe(false);
  });

  it('allows exact staging board origin only on the non-production default', () => {
    expect(isAllowedBridgeOrigin('https://vibes.staging.pubky.app', allowlist)).toBe(true);
    const productionAllowlist = parseSessionBridgeAllowlist(undefined, 'production');
    expect(isAllowedBridgeOrigin('https://vibes.staging.pubky.app', productionAllowlist)).toBe(false);
    expect(isAllowedBridgeOrigin('https://foo.vibes.staging.pubky.app', productionAllowlist)).toBe(false);
  });

  it('allows a single-label wildcard vibe host', () => {
    expect(isAllowedBridgeOrigin('https://foo.vibes.pubky.app', allowlist)).toBe(true);
    expect(isAllowedBridgeOrigin('https://foo.vibes.staging.pubky.app', allowlist)).toBe(true);
  });

  it('rejects nested labels under the wildcard', () => {
    expect(isAllowedBridgeOrigin('https://a.b.vibes.pubky.app', allowlist)).toBe(false);
  });

  it('rejects the apex host against the wildcard alone', () => {
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app', ['https://*.vibes.pubky.app'])).toBe(false);
  });

  it('rejects a similar suffix that is not a subdomain', () => {
    expect(isAllowedBridgeOrigin('https://xvibes.pubky.app', allowlist)).toBe(false);
  });

  it('rejects a suffix-spoofed host', () => {
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app.evil.com', allowlist)).toBe(false);
  });

  it('rejects a trailing-dot host against the wildcard', () => {
    expect(isAllowedBridgeOrigin('https://foo.vibes.pubky.app.', allowlist)).toBe(false);
  });

  it('rejects a wildcard host with a non-default port', () => {
    expect(isAllowedBridgeOrigin('https://foo.vibes.pubky.app:8443', allowlist)).toBe(false);
  });

  it('rejects the null origin string and an empty string', () => {
    expect(isAllowedBridgeOrigin('null', allowlist)).toBe(false);
    expect(isAllowedBridgeOrigin('', allowlist)).toBe(false);
  });

  it('matches IDN origins against the punycode allowlist entry', () => {
    const unicode = 'https://vibes.pükky.app';
    const punycodeOrigin = new URL(unicode).origin;
    expect(isAllowedBridgeOrigin(unicode, [punycodeOrigin])).toBe(true);
    expect(isAllowedBridgeOrigin(punycodeOrigin, [punycodeOrigin])).toBe(true);
  });

  it('allows the first-party shop origin by exact default entry', () => {
    expect(isAllowedBridgeOrigin('https://shop.pubky.app', allowlist)).toBe(true);
  });

  it('rejects other pubky.app hosts that are not listed', () => {
    expect(isAllowedBridgeOrigin('https://evil.pubky.app', allowlist)).toBe(false);
  });

  it('rejects a suffix-spoofed shop host', () => {
    expect(isAllowedBridgeOrigin('https://shop.pubky.app.evil.com', allowlist)).toBe(false);
  });

  it('rejects http on the shop host', () => {
    expect(isAllowedBridgeOrigin('http://shop.pubky.app', allowlist)).toBe(false);
  });

  it('rejects http origins that are not loopback', () => {
    expect(isAllowedBridgeOrigin('http://vibes.pubky.app', allowlist)).toBe(false);
    expect(isAllowedBridgeOrigin('http://foo.vibes.pubky.app', allowlist)).toBe(false);
  });

  it('allows http://localhost:3000 when explicitly listed', () => {
    expect(isAllowedBridgeOrigin('http://localhost:3000', allowlist)).toBe(true);
  });

  it('rejects localhost on an unlisted port', () => {
    expect(isAllowedBridgeOrigin('http://localhost:3001', allowlist)).toBe(false);
  });

  it('rejects 127.0.0.1 unless explicitly listed', () => {
    expect(isAllowedBridgeOrigin('http://127.0.0.1:3000', allowlist)).toBe(false);
    expect(isAllowedBridgeOrigin('http://127.0.0.1:3000', ['http://127.0.0.1:3000'])).toBe(true);
  });

  it('allows IPv6 loopback when explicitly listed', () => {
    expect(isAllowedBridgeOrigin('http://[::1]:3000', ['http://[::1]:3000'])).toBe(true);
    expect(isAllowedBridgeOrigin('http://[::1]:3000', allowlist)).toBe(false);
  });

  it('compares hosts case-insensitively and ports exactly', () => {
    expect(isAllowedBridgeOrigin('https://VIBES.PUBKY.APP', allowlist)).toBe(true);
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app:443', allowlist)).toBe(true);
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app:444', allowlist)).toBe(false);
  });

  it('rejects malformed origins', () => {
    expect(isAllowedBridgeOrigin('not-a-url', allowlist)).toBe(false);
    expect(isAllowedBridgeOrigin('https://vibes.pubky.app/path', allowlist)).toBe(false);
  });
});

describe('buildSessionBridgeFrameAncestors', () => {
  it('joins allowlist entries with spaces for CSP frame-ancestors', () => {
    expect(buildSessionBridgeFrameAncestors(allowlist)).toBe(
      'https://vibes.pubky.app https://*.vibes.pubky.app https://shop.pubky.app https://vibes.staging.pubky.app https://*.vibes.staging.pubky.app http://localhost:3000',
    );
  });

  it('includes the exact shop and vibes board origins and no pubky.app wildcard', () => {
    const frameAncestors = buildSessionBridgeFrameAncestors(allowlist);
    expect(frameAncestors.split(' ')).toContain('https://vibes.pubky.app');
    expect(frameAncestors.split(' ')).toContain('https://shop.pubky.app');
    expect(frameAncestors).not.toContain('https://*.pubky.app');
  });

  it('agrees with parseSessionBridgeAllowlist for the default env string', () => {
    const parsed = parseSessionBridgeAllowlist(DEFAULT_SESSION_BRIDGE_ALLOWED_ORIGINS);
    expect(buildSessionBridgeFrameAncestors(parsed)).toBe(parsed.join(' '));
  });
});

describe('buildSessionBridgeRouteHeaders', () => {
  it('emits frame-ancestors equal to the runtime allowlist join', () => {
    const parsed = parseSessionBridgeAllowlist(undefined);
    const routes = buildSessionBridgeRouteHeaders(undefined);
    expect(routes).toHaveLength(1);
    expect(routes[0].source).toBe('/session-bridge');
    const csp = routes[0].headers.find((header) => header.key === 'Content-Security-Policy');
    expect(csp?.value).toBe(`frame-ancestors ${buildSessionBridgeFrameAncestors(parsed)}`);
    expect(csp?.value).toContain('https://vibes.pubky.app');
    expect(csp?.value).toContain('https://shop.pubky.app');
    expect(routes[0].headers.map((header) => header.key)).toEqual([
      'Content-Security-Policy',
      'Referrer-Policy',
      'X-Robots-Tag',
    ]);
  });

  it('includes the exact vibes and shop origins on the production default CSP string', () => {
    const parsed = parseSessionBridgeAllowlist(undefined, 'production');
    const routes = buildSessionBridgeRouteHeaders(SESSION_BRIDGE_PROD_DEFAULT_ORIGINS);
    const csp = routes[0].headers.find((header) => header.key === 'Content-Security-Policy');
    expect(parsed).toEqual(['https://vibes.pubky.app', 'https://*.vibes.pubky.app', 'https://shop.pubky.app']);
    expect(csp?.value).toBe(`frame-ancestors ${buildSessionBridgeFrameAncestors(parsed)}`);
    expect(csp?.value).toContain('https://vibes.pubky.app');
    expect(csp?.value).toContain('https://shop.pubky.app');
    expect(csp?.value).not.toContain('vibes.staging.pubky.app');
    expect(csp?.value).not.toContain('https://*.pubky.app');
  });
});
