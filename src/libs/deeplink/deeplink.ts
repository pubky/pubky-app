import { getDeployEnv } from '@/config/network';

export interface GenerateDeeplinkOptions {
  encode?: boolean;
}

export type MobileAuthSigner = 'ring' | 'bitkit';

const PUBKYAUTH_PREFIX = 'pubkyauth://';
const PUBKY_RING_ANDROID_PACKAGE = 'to.pubky.ring';
const BITKIT_ANDROID_PACKAGE = 'to.bitkit';
// Staging pairs with the regtest Bitkit build so its payments are compatible.
const BITKIT_REGTEST_ANDROID_PACKAGE = 'to.bitkit.dev';
const CANONICAL_GRANT_URL = /^pubkyauth:\/\/(signin_grant|signup_grant)(?:\/[^\s?#]*)?(?:\?[^\s#]+)?$/;

export const generatePubkyRingDeeplink = (value: string, options: GenerateDeeplinkOptions = {}): string => {
  const { encode = true } = options;
  const payload = encode ? encodeURIComponent(value) : value;
  return `pubkyring://${payload}`;
};

// Bitkit rejects the link unless `pubky` is its only query parameter, so nothing may be appended to it.
export const generateBitkitContactDeeplink = (pubky: string): string =>
  `bitkit://contact?pubky=${encodeURIComponent(pubky)}`;

/** Bitkit iOS owns its own scheme; preserve the SDK's grant query byte for byte. */
export const toBitkitIosAuthUrl = (url: string): string => {
  const prefix = 'pubkyauth://signin_grant?';
  if (!url.startsWith(prefix)) return url;
  const query = url.slice(prefix.length);
  return query ? `bitkit://pubky-auth/signin?${query}` : url;
};

const getAndroidAuthPackage = (signer: MobileAuthSigner): string => {
  if (signer === 'ring') return PUBKY_RING_ANDROID_PACKAGE;
  return getDeployEnv() === 'staging' ? BITKIT_REGTEST_ANDROID_PACKAGE : BITKIT_ANDROID_PACKAGE;
};

/**
 * Wraps a canonical `pubkyauth://` grant URL in an Android `intent://` URI targeting the signer's
 * package, so Android opens that app directly without an app chooser or a saved "Always" default.
 * Everything after `pubkyauth://` is preserved byte for byte; non-canonical URLs keep the plain link.
 * No `S.browser_fallback_url` is set: when the package cannot handle the link (not installed, or
 * Bitkit without a local Pubky key), Chrome opens that package's Play Store listing.
 */
export const toAndroidAuthIntentUrl = (url: string, signer: MobileAuthSigner): string => {
  if (!CANONICAL_GRANT_URL.test(url)) return url;
  const rest = url.slice(PUBKYAUTH_PREFIX.length);
  const pkg = getAndroidAuthPackage(signer);
  return `intent://${rest}#Intent;scheme=pubkyauth;package=${pkg};end`;
};
