import { INLINE_IMAGE_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineImageUpload/useInlineImageUpload.types';

const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

export const PUBKY_REDACTED = '[redacted: pubky identifier]';
export const EMAIL_REDACTED = '[redacted: email]';
export const PHONE_REDACTED = '[redacted: phone]';
export const SENSITIVE_VALUE_REDACTED = '[redacted: sensitive field]';

export const RAW_PUBKY_PATTERN = new RegExp(`\\b[${Z32_ALPHABET}]{52}\\b`, 'gi');
export const PUBKY_URI_PATTERN = /\bpubky:\/\/[^\s"'<>]+/gi;
export const PUBKY_HTTP_HOST_PATTERN = /\bhttps?:\/\/_pubky\.[^\s"'<>]+/gi;
export const PUBKY_COMPACT_URI_PATTERN = new RegExp(`\\bpubky[${Z32_ALPHABET}]{52}(?:\\/[^\\s"'<>]*)?`, 'gi');
export const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
export const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
export const NEXUS_POST_TAGS_PATH_PATTERN = /^\/v0\/post\/[^/]+\/[^/]+\/tags$/;
/** `operation` tag set by `HomeserverService.subscribeUserEventStreamForPath`; matched by a Sentry drop rule. */
export const HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION = 'subscribeUserEventStreamForPath';

export const SENSITIVE_CONTEXT_KEYS = new Set([
  'avatar',
  'bio',
  'displayname',
  'email',
  'file',
  'firstname',
  'image',
  'lastname',
  'name',
  'phone',
  'phonenumber',
  'publickey',
  'pubky',
  'signature',
  'user',
  'userid',
  'username',
]);

/**
 * Noise neither error sink reports. `getSentryInitBase()` and `initPulse()` both spread this list into
 * their SDK's `ignoreErrors`, so the two sinks cannot drift onto different noise policies; add a pattern
 * here, never in one initializer. Matching differs slightly per SDK (Sentry tests the exception type and
 * value, Pulse the message and `type: message`), but the patterns are the same. No pattern may carry a
 * /g flag: Sentry calls `.test()` on the instance stored here, so a stateful `lastIndex` would make
 * matching order-dependent. (Pulse clones every RegExp at init, so only Sentry is exposed.)
 */
export const OBSERVABILITY_IGNORE_ERRORS: readonly (string | RegExp)[] = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Failed to fetch',
  /Loading chunk \d+ failed/,
  'AbortError',
  'Non-Error promise rejection captured',
  // Expected article inline-image upload rejections: surfaced to the user
  // via toast at the source, but MDXEditor's internal batch handling
  // rethrows them into a promise nobody owns, so Sentry's globalHandlers
  // would report them as unhandled. Genuine upload failures are already
  // captured with full context through the Err.* factory pipeline.
  INLINE_IMAGE_UPLOAD_REJECTION_NAME,
  // Native webview bridges (pubky-ring iOS/Android hosts) inject scripts that
  // talk to `window.webkit.messageHandlers` / the Android JavascriptInterface.
  // When the host tears the bridge down mid-navigation those injected scripts
  // throw from frames outside our bundle (PUBKY-APP-B6/B7/CJ). Nothing in the
  // app references the bridge (see rg for `messageHandlers`), so there is no
  // call site to guard — the patterns are specific to the host's messages.
  /window\.webkit\.messageHandlers/,
  /Java object is gone/,
  /Java exception was raised during method invocation/,
  // MetaMask (and similar wallets) inject `inpage.js` into every page; it
  // rejects with "Failed to connect to MetaMask" when the extension is
  // disabled mid-session (PUBKY-APP-8G). Not our code.
  /Failed to connect to MetaMask/,
];

export const PUBKY_IDENTIFIER_KEYS = new Set([
  'author',
  'authorid',
  'followee',
  'follower',
  'mutee',
  'muter',
  'taggerid',
]);
