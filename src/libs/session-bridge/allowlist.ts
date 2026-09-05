/**
 * Shared session-bridge origin allowlist parsing and matching.
 * Used by the client handler, Env schema, and next.config headers.
 */

/** Production board hosts plus first-party exact origins. Add team-operated hosts via PR, never `*.pubky.app`. */
export const SESSION_BRIDGE_PROD_DEFAULT_ORIGINS =
  'https://vibes.pubky.app,https://*.vibes.pubky.app,https://shop.pubky.app';

/** Staging board hosts. Appended only outside production; production staging deploys must set env explicitly. */
export const SESSION_BRIDGE_STAGING_DEFAULT_ORIGINS =
  'https://vibes.staging.pubky.app,https://*.vibes.staging.pubky.app';

export const SESSION_BRIDGE_DEV_LOOPBACK_ORIGIN = 'http://localhost:3000';

const HTTPS_WILDCARD_PREFIX = 'https://*.';

export function defaultSessionBridgeAllowedOrigins(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  if (nodeEnv === 'production') {
    return SESSION_BRIDGE_PROD_DEFAULT_ORIGINS;
  }

  return `${SESSION_BRIDGE_PROD_DEFAULT_ORIGINS},${SESSION_BRIDGE_STAGING_DEFAULT_ORIGINS},${SESSION_BRIDGE_DEV_LOOPBACK_ORIGIN}`;
}

export const DEFAULT_SESSION_BRIDGE_ALLOWED_ORIGINS = defaultSessionBridgeAllowedOrigins();

export function resolveSessionBridgeAllowlistInput(
  value: string | undefined | null,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  if (value === undefined || value === null || value.trim() === '') {
    return defaultSessionBridgeAllowedOrigins(nodeEnv);
  }

  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function parseOriginUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isOriginOnly(url: URL): boolean {
  const pathOk = url.pathname === '/' || url.pathname === '';
  return pathOk && url.search === '' && url.hash === '' && url.username === '' && url.password === '';
}

function isBareHostname(value: string): boolean {
  if (value.length === 0 || value.includes('*') || value.includes('/') || value.includes('?') || value.includes('#')) {
    return false;
  }

  if (value.includes('@') || value.includes(':') || value.includes('[') || value.includes(']')) {
    return false;
  }

  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) {
    return false;
  }

  const url = parseOriginUrl(`https://${value}`);
  if (url === null) {
    return false;
  }

  return url.hostname === value.toLowerCase() && url.port === '' && isOriginOnly(url);
}

/**
 * Accepts:
 * - an https origin with empty path/search/hash/userinfo and no wildcard
 * - `https://*.` + a bare hostname suffix with no port/userinfo/path
 * - an http origin whose host is localhost, 127.0.0.1, or [::1] (optional port)
 */
export function validateSessionBridgeAllowlistEntry(entry: string): boolean {
  if (entry.startsWith(HTTPS_WILDCARD_PREFIX)) {
    return isBareHostname(entry.slice(HTTPS_WILDCARD_PREFIX.length));
  }

  if (entry.includes('*')) {
    return false;
  }

  const url = parseOriginUrl(entry);
  if (url === null || !isOriginOnly(url) || entry !== url.origin) {
    return false;
  }

  if (url.protocol === 'https:') {
    return true;
  }

  return url.protocol === 'http:' && isLoopbackHostname(url.hostname);
}

export function formatInvalidSessionBridgeAllowlistError(invalidEntries: string[]): string {
  return `Invalid NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS entries: ${invalidEntries.join(', ')}`;
}

export function parseSessionBridgeAllowlist(
  value?: string | null,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string[] {
  const resolved = resolveSessionBridgeAllowlistInput(value, nodeEnv);
  const entries = resolved
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error('Invalid NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS entries: (empty allowlist)');
  }

  const invalidEntries = entries.filter((entry) => !validateSessionBridgeAllowlistEntry(entry));
  if (invalidEntries.length > 0) {
    throw new Error(formatInvalidSessionBridgeAllowlistError(invalidEntries));
  }

  return entries;
}

export function buildSessionBridgeFrameAncestors(allowlist: string[]): string {
  return allowlist.join(' ');
}

export function buildSessionBridgeRouteHeaders(envValue?: string | null) {
  const allowlist = parseSessionBridgeAllowlist(envValue);
  const frameAncestors = buildSessionBridgeFrameAncestors(allowlist);

  return [
    {
      source: '/session-bridge',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: `frame-ancestors ${frameAncestors}`,
        },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex' },
      ],
    },
  ];
}

function matchWildcardEntry(originUrl: URL, entry: string): boolean {
  if (!entry.startsWith(HTTPS_WILDCARD_PREFIX)) {
    return false;
  }

  const suffixRaw = entry.slice(HTTPS_WILDCARD_PREFIX.length);
  if (!isBareHostname(suffixRaw)) {
    return false;
  }

  if (originUrl.protocol !== 'https:') {
    return false;
  }

  if (originUrl.port !== '') {
    return false;
  }

  const suffixHost = suffixRaw.toLowerCase();
  const originHost = originUrl.hostname;
  const dottedSuffix = `.${suffixHost}`;

  if (originHost.length <= dottedSuffix.length) {
    return false;
  }

  if (originHost.slice(originHost.length - dottedSuffix.length) !== dottedSuffix) {
    return false;
  }

  const label = originHost.slice(0, originHost.length - dottedSuffix.length);
  return label.length > 0 && !label.includes('.');
}

function matchExactEntry(originUrl: URL, entry: string): boolean {
  if (entry.startsWith(HTTPS_WILDCARD_PREFIX)) {
    return false;
  }

  const entryUrl = parseOriginUrl(entry);
  if (entryUrl === null) {
    return false;
  }

  const originIsHttps = originUrl.protocol === 'https:';
  const originIsLoopbackHttp = originUrl.protocol === 'http:' && isLoopbackHostname(originUrl.hostname);
  if (!originIsHttps && !originIsLoopbackHttp) {
    return false;
  }

  const entryIsHttps = entryUrl.protocol === 'https:';
  const entryIsLoopbackHttp = entryUrl.protocol === 'http:' && isLoopbackHostname(entryUrl.hostname);
  if (!entryIsHttps && !entryIsLoopbackHttp) {
    return false;
  }

  return originUrl.origin === entryUrl.origin;
}

export function isAllowedBridgeOrigin(origin: string, allowlist: string[]): boolean {
  const originUrl = parseOriginUrl(origin);
  if (originUrl === null || !isOriginOnly(originUrl)) {
    return false;
  }

  for (const entry of allowlist) {
    if (matchWildcardEntry(originUrl, entry) || matchExactEntry(originUrl, entry)) {
      return true;
    }
  }

  return false;
}
