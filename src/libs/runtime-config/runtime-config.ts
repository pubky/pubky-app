import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import {
  PUBKY_RUNTIME_ENV_NAMES,
  type RuntimeConfig,
  runtimeConfigValueSchema,
  runtimeEnvInputSchema,
  runtimeEnvInputSchemaWithDefaults,
} from './runtime-config.schema';

/**
 * Server-injected synchronous runtime config.
 *
 * - Server: reads non-inlined `PUBKY_RUNTIME_*` env at request time, validates, and memoizes.
 *   The same memoized object is serialized into the HTML (see `serializeRuntimeConfig`).
 * - Client: reads the injected `window.__PUBKY_CONFIG__`, validates, and memoizes.
 * - dev/test: reads the same `PUBKY_RUNTIME_*` names leniently (honoring `.env.local` /
 *   `src/config/test.ts` partial overrides), with staging defaults filling the gaps.
 *
 * This module must NOT import `Env` (keeps the import graph a leaf, avoids the env<->logger cycle).
 */

export const RUNTIME_CONFIG_WINDOW_KEY = '__PUBKY_CONFIG__';

declare global {
  interface Window {
    [RUNTIME_CONFIG_WINDOW_KEY]?: unknown;
  }
}

let memoizedConfig: RuntimeConfig | null = null;

const REQUIRED_NETWORK_ENV_MESSAGE =
  'Set all required PUBKY_RUNTIME_* network variables: ' +
  'PUBKY_RUNTIME_NEXUS_URL, PUBKY_RUNTIME_CDN_URL, PUBKY_RUNTIME_HOMESERVER, ' +
  'PUBKY_RUNTIME_HOMESERVER_URL, PUBKY_RUNTIME_HOMEGATE_URL, PUBKY_RUNTIME_DEFAULT_HTTP_RELAY, ' +
  'PUBKY_RUNTIME_PKARR_RELAYS, and PUBKY_RUNTIME_TESTNET. ' +
  'Optional/defaulted PUBKY_RUNTIME_* values may be set independently.';

/**
 * Whether a valid runtime config MUST be present (fail loud instead of falling back).
 * True for deployed environments (incl. staging, which runs NODE_ENV=production) and when
 * explicitly opted in via PUBKY_RUNTIME_CONFIG_REQUIRED; never true under tests.
 */
function isRuntimeConfigRequired(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false;
  return process.env.NODE_ENV === 'production' || process.env.PUBKY_RUNTIME_CONFIG_REQUIRED === 'true';
}

/**
 * `next build` runs with NODE_ENV=production and imports modules for data collection. The
 * resolver is only ever invoked at request time, but this guard ensures that even if it were
 * reached during the build phase it would not throw.
 */
function isProductionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

/** Collect the raw `PUBKY_RUNTIME_*` string values keyed by config field name. */
function readRuntimeEnvInput(): Record<string, string | undefined> {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(PUBKY_RUNTIME_ENV_NAMES) as (keyof RuntimeConfig)[]) {
    input[key] = process.env[PUBKY_RUNTIME_ENV_NAMES[key]];
  }
  return input;
}

/**
 * dev/test parse: read `PUBKY_RUNTIME_*` through the defaulted schema, so local `.env.local`
 * and test overrides are honored (partial values layer over staging defaults).
 */
function parseLenientConfig(): RuntimeConfig {
  return runtimeEnvInputSchemaWithDefaults.parse(readRuntimeEnvInput());
}

/** Exported for unit tests; prefer `getRuntimeConfig()` in app code. */
export function readServerConfig(): RuntimeConfig {
  // Deployed/required mode: strict parse — ALL required network values must be set and valid.
  // Partial deploy config fails loudly instead of silently resolving to staging defaults.
  if (isRuntimeConfigRequired() && !isProductionBuildPhase()) {
    const result = runtimeEnvInputSchema.safeParse(readRuntimeEnvInput());
    if (!result.success) {
      throw new Error(`Runtime config is incomplete or invalid. ${REQUIRED_NETWORK_ENV_MESSAGE}`, {
        cause: result.error,
      });
    }
    return result.data;
  }

  return parseLenientConfig();
}

/** Exported for unit tests; prefer `getRuntimeConfig()` in app code. */
export function readClientConfig(): RuntimeConfig {
  const injected = window[RUNTIME_CONFIG_WINDOW_KEY];
  if (injected !== undefined) {
    return runtimeConfigValueSchema.parse(injected);
  }

  if (isRuntimeConfigRequired()) {
    throw new Error('Runtime config is required but window.__PUBKY_CONFIG__ was not injected.');
  }

  return parseLenientConfig();
}

/**
 * Resolve the runtime config once per process (server) / page load (client), memoized.
 * The same object is used for SSR reads and for the injected script (no double-read drift).
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (memoizedConfig) return memoizedConfig;
  memoizedConfig = typeof window === 'undefined' ? readServerConfig() : readClientConfig();
  return memoizedConfig;
}

/**
 * Escape a JSON string for safe inlining inside an HTML <script> element.
 * Neutralizes `<` (covers `</script>`) and the JS-invalid line separators U+2028/U+2029.
 */
export function escapeForInlineScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Build the inline script body that publishes the resolved config to the browser.
 * Called from the dynamic root layout at request time (server only).
 */
export function serializeRuntimeConfig(): string {
  const config = getRuntimeConfig();
  const escaped = escapeForInlineScript(JSON.stringify(config));
  return `window.${RUNTIME_CONFIG_WINDOW_KEY}=Object.freeze(${escaped});`;
}

/**
 * Test-only: clear the memoized config so a test can re-resolve after changing env/window.
 */
export function resetRuntimeConfigForTests(): void {
  memoizedConfig = null;
}

// Lazy getters: read the resolved config at call time (never captured at module load).
export const getNexusUrl = (): string => getRuntimeConfig().nexusUrl;
export const getCdnUrl = (): string => getRuntimeConfig().cdnUrl;
export const getHomeserver = (): string => getRuntimeConfig().homeserver;
export const getHomeserverUrl = (): string => getRuntimeConfig().homeserverUrl;
export const getHomegateUrl = (): string => getRuntimeConfig().homegateUrl;
export const getDefaultHttpRelay = (): string => getRuntimeConfig().defaultHttpRelay;
export const getPkarrRelays = (): string[] => getRuntimeConfig().pkarrRelays;
export const getTestnet = (): boolean => getRuntimeConfig().testnet;

// Optional observability tier (absent DSN = Sentry disabled; rates fall back to schema defaults).
export const getSentryDsn = (): string | undefined => getRuntimeConfig().sentryDsn;
export const getSentryEnvironment = (): string | undefined => getRuntimeConfig().sentryEnvironment;
export const getSentryTracesSampleRate = (): number => getRuntimeConfig().sentryTracesSampleRate;
export const getSentryReplaysSessionSampleRate = (): number => getRuntimeConfig().sentryReplaysSessionSampleRate;
export const getSentryReplaysOnErrorSampleRate = (): number => getRuntimeConfig().sentryReplaysOnErrorSampleRate;
export const getNotificationPollIntervalMs = (): number => getRuntimeConfig().notificationPollIntervalMs;
export const getNotificationPollOnStart = (): boolean => getRuntimeConfig().notificationPollOnStart;
export const getNotificationRespectPageVisibility = (): boolean => getRuntimeConfig().notificationRespectPageVisibility;
export const getStreamPollIntervalMs = (): number => getRuntimeConfig().streamPollIntervalMs;
export const getStreamPollOnStart = (): boolean => getRuntimeConfig().streamPollOnStart;
export const getStreamRespectPageVisibility = (): boolean => getRuntimeConfig().streamRespectPageVisibility;
export const getStreamFetchLimit = (): number => getRuntimeConfig().streamFetchLimit;
export const getStreamCacheMaxAgeMs = (): number => getRuntimeConfig().streamCacheMaxAgeMs;
export const getMaxStreamTags = (): number => getRuntimeConfig().maxStreamTags;
export const getTtlPostMs = (): number => getRuntimeConfig().ttlPostMs;
export const getTtlUserMs = (): number => getRuntimeConfig().ttlUserMs;
export const getTtlBatchIntervalMs = (): number => getRuntimeConfig().ttlBatchIntervalMs;
export const getTtlPostMaxBatchSize = (): number => getRuntimeConfig().ttlPostMaxBatchSize;
export const getTtlUserMaxBatchSize = (): number => getRuntimeConfig().ttlUserMaxBatchSize;
export const getTtlRetryDelayMs = (): number => getRuntimeConfig().ttlRetryDelayMs;
export const getModerationId = (): string => getRuntimeConfig().moderationId;
export const getModeratedTags = (): string[] => getRuntimeConfig().moderatedTags;
export const getExchangeRateApi = (): string => getRuntimeConfig().exchangeRateApi;
export const getPreludeSdkKey = (): string | undefined => getRuntimeConfig().preludeSdkKey;
export const getPreludeSdkTimeoutMs = (): number => getRuntimeConfig().preludeSdkTimeoutMs;
export const getPlausibleDomain = (): string | undefined => getRuntimeConfig().plausibleDomain;
export const getPlausibleScriptUrl = (): string | undefined => getRuntimeConfig().plausibleScriptUrl;
export const getPreviewImage = (): string => getRuntimeConfig().previewImage;
export const getSiteName = (): string => getRuntimeConfig().siteName;
export const getLocale = (): string => getRuntimeConfig().locale;
export const getAuthor = (): string => getRuntimeConfig().author;
export const getKeywords = (): string => getRuntimeConfig().keywords;
export const getType = (): string => getRuntimeConfig().type;
export const getCreator = (): string => getRuntimeConfig().creator;
export const getDefaultUrl = (): string => getRuntimeConfig().defaultUrl;
export const getPubkyRingUrl = (): string => getRuntimeConfig().pubkyRingUrl;
export const getPubkyCoreUrl = (): string => getRuntimeConfig().pubkyCoreUrl;
export const getTwitterUrl = (): string => getRuntimeConfig().twitterUrl;
export const getTwitterGetpubkyUrl = (): string => getRuntimeConfig().twitterGetpubkyUrl;
export const getTelegramUrl = (): string => getRuntimeConfig().telegramUrl;
export const getGithubUrl = (): string => getRuntimeConfig().githubUrl;
export const getEmail = (): string => getRuntimeConfig().email;
export const getAppStoreUrl = (): string => getRuntimeConfig().appStoreUrl;
export const getPlayStoreUrl = (): string => getRuntimeConfig().playStoreUrl;
