import { z } from 'zod';

/**
 * Shared, zod-only schema for the environment-specific values that must be configurable at
 * RUNTIME (so a single Docker image works across staging/prod/testnet and can be deployed by
 * third parties against their own infrastructure).
 *
 * The config has multiple tiers:
 *  - REQUIRED network values (nexusUrl, cdnUrl, ...): a deployed container must set all of
 *    them; partial config fails loudly instead of silently resolving to staging defaults.
 *  - OPTIONAL observability values (sentry*): absent means the feature is disabled (DSN) or
 *    a documented default applies (sample rates).
 *  - OPTIONAL/DEFAULTED app/deployer values: public operational, moderation, metadata,
 *    analytics, Prelude, and external-link values that deployers may override without rebuilding.
 *
 * This module is a leaf (zod only, no `Env`, no logger) so the runtime-config resolver never
 * pulls in the heavy `env -> libs/error -> logger -> env` import cycle.
 *
 * Two schemas are intentionally provided because the two inputs differ in shape:
 *  - env vars arrive as STRINGS (e.g. `PKARR_RELAYS` is a JSON string, `TESTNET` is "true"/"false")
 *  - the injected browser object (`window.__PUBKY_CONFIG__`) is ALREADY PARSED
 * A single transforming schema would reject one of these, so we keep them separate but build
 * both from the same field validators + default constants.
 */

// ---------------------------------------------------------------------------
// Shared field validators (parsed-value shape)
// ---------------------------------------------------------------------------

const urlValue = z.url();
const homeserverValue = z.string().min(1);
const pkarrRelaysValue = z.array(z.url()).min(1);
const testnetValue = z.boolean();
const sampleRateValue = z.number().min(0).max(1);
const positiveIntValue = z.number().int().positive();
const nonEmptyStringValue = z.string().min(1);
const pubkyValue = z
  .string()
  .trim()
  .regex(/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/, 'Expected a 52-character z-base-32 Pubky');

/** Parse a JSON-array-of-strings env value into a string[]. Throws on malformed input. */
function parseJsonStringArray(val: string, label = 'value'): string[] {
  const parsed: unknown = JSON.parse(val);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  for (const item of parsed) {
    if (typeof item !== 'string') {
      throw new Error(`Each ${label} item must be a string`);
    }
  }
  return parsed as string[];
}

function parsePkarrRelaysString(val: string): string[] {
  return parseJsonStringArray(val, 'PKARR_RELAYS');
}

// String-input transforms (env var -> parsed value)
const pkarrRelaysFromString = z.string().transform((val, ctx) => {
  try {
    return parsePkarrRelaysString(val);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: `Invalid PKARR_RELAYS value: ${(error as Error).message}` });
    return z.NEVER;
  }
});

const booleanString = z.enum(['true', 'false']);

const testnetFromString = booleanString.transform((val) => val === 'true');

const optionalBooleanFromString = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined || val.trim() === '') return undefined;
    const parsed = booleanString.safeParse(val);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'Expected "true" or "false"' });
      return z.NEVER;
    }
    return parsed.data === 'true';
  })
  .pipe(z.boolean().optional());

const optionalPositiveIntFromString = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined || val.trim() === '') return undefined;
    if (!/^[1-9]\d*$/.test(val)) {
      ctx.addIssue({ code: 'custom', message: 'Expected a positive integer' });
      return z.NEVER;
    }
    return Number(val);
  })
  .pipe(positiveIntValue.optional());

const optionalStringArrayFromString = (label: string) =>
  z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val.trim() === '') return undefined;
      try {
        return parseJsonStringArray(val, label);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: `Invalid ${label} value: ${(error as Error).message}` });
        return z.NEVER;
      }
    })
    // Empty arrays are intentional (e.g. MODERATED_TAGS=[] means no moderated tags).
    // Unset / blank strings stay `undefined` so the value-schema default still applies.
    .pipe(z.array(nonEmptyStringValue).optional());

/**
 * Optional-tier env strings: a missing OR empty/whitespace value means "unset".
 * The outer `.optional()` keeps the key optional in the OUTPUT type too, so the env-input
 * schemas stay pipe-compatible with `runtimeConfigValueSchema` (which owns the final
 * validation and defaults for the optional tier).
 */
const optionalTrimmedString = z
  .string()
  .transform((val) => (val.trim() !== '' ? val : undefined))
  .optional();

const optionalUrlFromString = optionalTrimmedString.pipe(urlValue.optional());

/** Rates validate eagerly (bad number/range throws here); the default applies in the value schema. */
const sampleRateFromString = z
  .string()
  .regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/, 'Expected a number between 0 and 1')
  .transform((val) => Number(val))
  .pipe(sampleRateValue)
  .optional();

/**
 * Defaults for the optional Sentry sample rates (applied by `runtimeConfigValueSchema`, which
 * every parse path runs through, so the resolved config always carries concrete numbers even
 * when the env leaves them unset).
 */
export const SENTRY_RUNTIME_DEFAULTS = {
  sentryTracesSampleRate: 0.1,
  sentryReplaysSessionSampleRate: 0.0,
  sentryReplaysOnErrorSampleRate: 1.0,
} as const;

export const APP_RUNTIME_DEFAULTS = {
  notificationPollIntervalMs: 8888,
  notificationPollOnStart: true,
  notificationRespectPageVisibility: true,
  streamPollIntervalMs: 8888,
  streamPollOnStart: false,
  streamRespectPageVisibility: true,
  streamFetchLimit: 10,
  streamCacheMaxAgeMs: 300_000,
  maxStreamTags: 5,
  ttlPostMs: 300_000,
  ttlUserMs: 600_000,
  ttlBatchIntervalMs: 5_000,
  ttlPostMaxBatchSize: 20,
  ttlUserMaxBatchSize: 20,
  ttlRetryDelayMs: 60_000,
  moderationId: 'nto4u7kkagk5hfjk4wgueemzy61nssic811hid1ty9u81uatmqzy',
  moderatedTags: ['nudity'],
  exchangeRateApi: 'https://api1.blocktank.to/api/fx/rates/btc',
  preludeSdkTimeoutMs: 5_000,
  previewImage: '/preview.webp',
  siteName: 'Pubky App',
  locale: 'en_US',
  author: 'Pubky Team',
  keywords: 'pubky, social media, decentralized, key, pkarr, pubky core',
  type: 'website',
  creator: '@getpubky',
  defaultUrl: 'https://pubky.app',
  pubkyRingUrl: 'https://pubkyring.app/',
  pubkyCoreUrl: 'https://pubky.org',
  nexusScoutUrl: 'https://nexus-scout.pubky.app',
  twitterUrl: 'https://x.com/pubky',
  twitterGetpubkyUrl: 'https://x.com/getpubky',
  telegramUrl: 'https://t.me/pubkychat',
  githubUrl: 'https://github.com/pubky',
  email: 'hello@pubky.com',
  appStoreUrl: 'https://apps.apple.com/app/pubky-ring/id6739356756',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=to.pubky.ring&pcampaignid=web_share',
} as const;

// ---------------------------------------------------------------------------
// App-facing config shape
// ---------------------------------------------------------------------------

/**
 * REQUIRED tier: environment-specific network values. A deployed container must set all of
 * them (see `runtimeEnvInputSchema`).
 */
export const networkConfigValueSchema = z.object({
  nexusUrl: urlValue,
  cdnUrl: urlValue,
  homeserver: homeserverValue,
  /** Homeserver HTTP base URL: the homeserver pubkey has no resolvable HTTPS endpoint (pubky-core#410) */
  homeserverUrl: urlValue,
  homegateUrl: urlValue,
  defaultHttpRelay: urlValue,
  pkarrRelays: pkarrRelaysValue,
  testnet: testnetValue,
});

export type NetworkRuntimeConfig = z.infer<typeof networkConfigValueSchema>;

/**
 * Parsed runtime config (required network tier + optional/defaulted public tiers).
 * Validates `window.__PUBKY_CONFIG__`.
 */
export const runtimeConfigValueSchema = networkConfigValueSchema.extend({
  /** Sentry DSN shared by browser/server/edge. Absent/empty disables Sentry entirely. */
  sentryDsn: urlValue.optional(),
  /** Environment tag attached to every Sentry event. Absent falls back to NODE_ENV (see sentry.ts). */
  sentryEnvironment: z.string().min(1).optional(),
  sentryTracesSampleRate: sampleRateValue.default(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate),
  sentryReplaysSessionSampleRate: sampleRateValue.default(SENTRY_RUNTIME_DEFAULTS.sentryReplaysSessionSampleRate),
  sentryReplaysOnErrorSampleRate: sampleRateValue.default(SENTRY_RUNTIME_DEFAULTS.sentryReplaysOnErrorSampleRate),
  notificationPollIntervalMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.notificationPollIntervalMs),
  notificationPollOnStart: z.boolean().default(APP_RUNTIME_DEFAULTS.notificationPollOnStart),
  notificationRespectPageVisibility: z.boolean().default(APP_RUNTIME_DEFAULTS.notificationRespectPageVisibility),
  streamPollIntervalMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.streamPollIntervalMs),
  streamPollOnStart: z.boolean().default(APP_RUNTIME_DEFAULTS.streamPollOnStart),
  streamRespectPageVisibility: z.boolean().default(APP_RUNTIME_DEFAULTS.streamRespectPageVisibility),
  streamFetchLimit: positiveIntValue.default(APP_RUNTIME_DEFAULTS.streamFetchLimit),
  streamCacheMaxAgeMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.streamCacheMaxAgeMs),
  maxStreamTags: positiveIntValue.default(APP_RUNTIME_DEFAULTS.maxStreamTags),
  ttlPostMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.ttlPostMs),
  ttlUserMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.ttlUserMs),
  ttlBatchIntervalMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.ttlBatchIntervalMs),
  ttlPostMaxBatchSize: positiveIntValue.default(APP_RUNTIME_DEFAULTS.ttlPostMaxBatchSize),
  ttlUserMaxBatchSize: positiveIntValue.default(APP_RUNTIME_DEFAULTS.ttlUserMaxBatchSize),
  ttlRetryDelayMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.ttlRetryDelayMs),
  moderationId: pubkyValue.optional(),
  moderatedTags: z.array(nonEmptyStringValue).default([...APP_RUNTIME_DEFAULTS.moderatedTags]),
  exchangeRateApi: urlValue.default(APP_RUNTIME_DEFAULTS.exchangeRateApi),
  preludeSdkKey: nonEmptyStringValue.optional(),
  preludeSdkTimeoutMs: positiveIntValue.default(APP_RUNTIME_DEFAULTS.preludeSdkTimeoutMs),
  plausibleDomain: nonEmptyStringValue.optional(),
  plausibleScriptUrl: urlValue.optional(),
  previewImage: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.previewImage),
  siteName: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.siteName),
  locale: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.locale),
  author: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.author),
  keywords: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.keywords),
  type: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.type),
  creator: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.creator),
  defaultUrl: urlValue.default(APP_RUNTIME_DEFAULTS.defaultUrl),
  pubkyRingUrl: urlValue.default(APP_RUNTIME_DEFAULTS.pubkyRingUrl),
  pubkyCoreUrl: urlValue.default(APP_RUNTIME_DEFAULTS.pubkyCoreUrl),
  nexusScoutUrl: urlValue.default(APP_RUNTIME_DEFAULTS.nexusScoutUrl),
  twitterUrl: urlValue.default(APP_RUNTIME_DEFAULTS.twitterUrl),
  twitterGetpubkyUrl: urlValue.default(APP_RUNTIME_DEFAULTS.twitterGetpubkyUrl),
  telegramUrl: urlValue.default(APP_RUNTIME_DEFAULTS.telegramUrl),
  githubUrl: urlValue.default(APP_RUNTIME_DEFAULTS.githubUrl),
  email: nonEmptyStringValue.default(APP_RUNTIME_DEFAULTS.email),
  appStoreUrl: urlValue.default(APP_RUNTIME_DEFAULTS.appStoreUrl),
  playStoreUrl: urlValue.default(APP_RUNTIME_DEFAULTS.playStoreUrl),
});

const lenientRuntimeConfigValueSchema = runtimeConfigValueSchema.extend({
  // Zod v4 `.default()` bypasses validation; `.prefault()` sends the staging fallback through pubkyValue.
  moderationId: pubkyValue.prefault(APP_RUNTIME_DEFAULTS.moderationId),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigValueSchema>;

/**
 * Strict env-input schema (string inputs -> parsed `RuntimeConfig`). NO defaults for the
 * required network tier: a missing value THROWS. Used for the production parse of
 * `PUBKY_RUNTIME_*` so partial deploy config fails loudly instead of silently resolving to a
 * staging URL. Optional public values stay optional here (for example, absent moderationId
 * disables moderation behavior; absent Sentry DSN disables Sentry).
 */
export const runtimeEnvInputSchema = z
  .object({
    nexusUrl: urlValue,
    cdnUrl: urlValue,
    homeserver: homeserverValue,
    homeserverUrl: urlValue,
    homegateUrl: urlValue,
    defaultHttpRelay: urlValue,
    pkarrRelays: pkarrRelaysFromString,
    testnet: testnetFromString,
    sentryDsn: optionalTrimmedString,
    sentryEnvironment: optionalTrimmedString,
    sentryTracesSampleRate: sampleRateFromString,
    sentryReplaysSessionSampleRate: sampleRateFromString,
    sentryReplaysOnErrorSampleRate: sampleRateFromString,
    notificationPollIntervalMs: optionalPositiveIntFromString,
    notificationPollOnStart: optionalBooleanFromString,
    notificationRespectPageVisibility: optionalBooleanFromString,
    streamPollIntervalMs: optionalPositiveIntFromString,
    streamPollOnStart: optionalBooleanFromString,
    streamRespectPageVisibility: optionalBooleanFromString,
    streamFetchLimit: optionalPositiveIntFromString,
    streamCacheMaxAgeMs: optionalPositiveIntFromString,
    maxStreamTags: optionalPositiveIntFromString,
    ttlPostMs: optionalPositiveIntFromString,
    ttlUserMs: optionalPositiveIntFromString,
    ttlBatchIntervalMs: optionalPositiveIntFromString,
    ttlPostMaxBatchSize: optionalPositiveIntFromString,
    ttlUserMaxBatchSize: optionalPositiveIntFromString,
    ttlRetryDelayMs: optionalPositiveIntFromString,
    moderationId: optionalTrimmedString,
    moderatedTags: optionalStringArrayFromString('MODERATED_TAGS'),
    exchangeRateApi: optionalUrlFromString,
    preludeSdkKey: optionalTrimmedString,
    preludeSdkTimeoutMs: optionalPositiveIntFromString,
    plausibleDomain: optionalTrimmedString,
    plausibleScriptUrl: optionalUrlFromString,
    previewImage: optionalTrimmedString,
    siteName: optionalTrimmedString,
    locale: optionalTrimmedString,
    author: optionalTrimmedString,
    keywords: optionalTrimmedString,
    type: optionalTrimmedString,
    creator: optionalTrimmedString,
    defaultUrl: optionalUrlFromString,
    pubkyRingUrl: optionalUrlFromString,
    pubkyCoreUrl: optionalUrlFromString,
    nexusScoutUrl: optionalUrlFromString,
    twitterUrl: optionalUrlFromString,
    twitterGetpubkyUrl: optionalUrlFromString,
    telegramUrl: optionalUrlFromString,
    githubUrl: optionalUrlFromString,
    email: optionalTrimmedString,
    appStoreUrl: optionalUrlFromString,
    playStoreUrl: optionalUrlFromString,
  })
  .pipe(runtimeConfigValueSchema);

/**
 * Canonical staging defaults for the required network tier (single source of truth, parsed shape).
 */
export const NETWORK_RUNTIME_DEFAULTS: NetworkRuntimeConfig = {
  nexusUrl: 'https://nexus.staging.pubky.app',
  cdnUrl: 'https://nexus.staging.pubky.app/static',
  homeserver: 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy',
  homeserverUrl: 'https://homeserver.staging.pubky.app',
  homegateUrl: 'https://homegate.staging.pubky.app',
  defaultHttpRelay: 'https://httprelay.staging.pubky.app/inbox',
  pkarrRelays: ['https://pkarr.pubky.app', 'https://pkarr.pubky.org'],
  testnet: false,
};

/**
 * Env-input schema WITH staging defaults layered. Used only by the lenient dev/test parse of
 * `PUBKY_RUNTIME_*` (never for the strict deployed/required-mode parse).
 */
export const runtimeEnvInputSchemaWithDefaults = z
  .object({
    nexusUrl: urlValue.default(NETWORK_RUNTIME_DEFAULTS.nexusUrl),
    cdnUrl: urlValue.default(NETWORK_RUNTIME_DEFAULTS.cdnUrl),
    homeserver: homeserverValue.default(NETWORK_RUNTIME_DEFAULTS.homeserver),
    homeserverUrl: urlValue.default(NETWORK_RUNTIME_DEFAULTS.homeserverUrl),
    homegateUrl: urlValue.default(NETWORK_RUNTIME_DEFAULTS.homegateUrl),
    defaultHttpRelay: urlValue.default(NETWORK_RUNTIME_DEFAULTS.defaultHttpRelay),
    pkarrRelays: z.string().default(JSON.stringify(NETWORK_RUNTIME_DEFAULTS.pkarrRelays)).pipe(pkarrRelaysFromString),
    testnet: z.string().default(String(NETWORK_RUNTIME_DEFAULTS.testnet)).pipe(testnetFromString),
    sentryDsn: optionalTrimmedString,
    sentryEnvironment: optionalTrimmedString,
    sentryTracesSampleRate: sampleRateFromString,
    sentryReplaysSessionSampleRate: sampleRateFromString,
    sentryReplaysOnErrorSampleRate: sampleRateFromString,
    notificationPollIntervalMs: optionalPositiveIntFromString,
    notificationPollOnStart: optionalBooleanFromString,
    notificationRespectPageVisibility: optionalBooleanFromString,
    streamPollIntervalMs: optionalPositiveIntFromString,
    streamPollOnStart: optionalBooleanFromString,
    streamRespectPageVisibility: optionalBooleanFromString,
    streamFetchLimit: optionalPositiveIntFromString,
    streamCacheMaxAgeMs: optionalPositiveIntFromString,
    maxStreamTags: optionalPositiveIntFromString,
    ttlPostMs: optionalPositiveIntFromString,
    ttlUserMs: optionalPositiveIntFromString,
    ttlBatchIntervalMs: optionalPositiveIntFromString,
    ttlPostMaxBatchSize: optionalPositiveIntFromString,
    ttlUserMaxBatchSize: optionalPositiveIntFromString,
    ttlRetryDelayMs: optionalPositiveIntFromString,
    moderationId: optionalTrimmedString,
    moderatedTags: optionalStringArrayFromString('MODERATED_TAGS'),
    exchangeRateApi: optionalUrlFromString,
    preludeSdkKey: optionalTrimmedString,
    preludeSdkTimeoutMs: optionalPositiveIntFromString,
    plausibleDomain: optionalTrimmedString,
    plausibleScriptUrl: optionalUrlFromString,
    previewImage: optionalTrimmedString,
    siteName: optionalTrimmedString,
    locale: optionalTrimmedString,
    author: optionalTrimmedString,
    keywords: optionalTrimmedString,
    type: optionalTrimmedString,
    creator: optionalTrimmedString,
    defaultUrl: optionalUrlFromString,
    pubkyRingUrl: optionalUrlFromString,
    pubkyCoreUrl: optionalUrlFromString,
    nexusScoutUrl: optionalUrlFromString,
    twitterUrl: optionalUrlFromString,
    twitterGetpubkyUrl: optionalUrlFromString,
    telegramUrl: optionalUrlFromString,
    githubUrl: optionalUrlFromString,
    email: optionalTrimmedString,
    appStoreUrl: optionalUrlFromString,
    playStoreUrl: optionalUrlFromString,
  })
  .pipe(lenientRuntimeConfigValueSchema);

// ---------------------------------------------------------------------------
// Env-name <-> config-key mapping
// ---------------------------------------------------------------------------

/**
 * Runtime env var names (non-NEXT_PUBLIC, so Next does not inline them at build time).
 * Their VALUES are supplied at container runtime; they are PUBLIC values, not secrets.
 */
const NETWORK_RUNTIME_ENV_NAMES: Record<keyof NetworkRuntimeConfig, string> = {
  nexusUrl: 'PUBKY_RUNTIME_NEXUS_URL',
  cdnUrl: 'PUBKY_RUNTIME_CDN_URL',
  homeserver: 'PUBKY_RUNTIME_HOMESERVER',
  homeserverUrl: 'PUBKY_RUNTIME_HOMESERVER_URL',
  homegateUrl: 'PUBKY_RUNTIME_HOMEGATE_URL',
  defaultHttpRelay: 'PUBKY_RUNTIME_DEFAULT_HTTP_RELAY',
  pkarrRelays: 'PUBKY_RUNTIME_PKARR_RELAYS',
  testnet: 'PUBKY_RUNTIME_TESTNET',
};

export const PUBKY_RUNTIME_ENV_NAMES: Record<keyof RuntimeConfig, string> = {
  ...NETWORK_RUNTIME_ENV_NAMES,
  sentryDsn: 'PUBKY_RUNTIME_SENTRY_DSN',
  sentryEnvironment: 'PUBKY_RUNTIME_SENTRY_ENVIRONMENT',
  sentryTracesSampleRate: 'PUBKY_RUNTIME_SENTRY_TRACES_SAMPLE_RATE',
  sentryReplaysSessionSampleRate: 'PUBKY_RUNTIME_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
  sentryReplaysOnErrorSampleRate: 'PUBKY_RUNTIME_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
  notificationPollIntervalMs: 'PUBKY_RUNTIME_NOTIFICATION_POLL_INTERVAL_MS',
  notificationPollOnStart: 'PUBKY_RUNTIME_NOTIFICATION_POLL_ON_START',
  notificationRespectPageVisibility: 'PUBKY_RUNTIME_NOTIFICATION_RESPECT_PAGE_VISIBILITY',
  streamPollIntervalMs: 'PUBKY_RUNTIME_STREAM_POLL_INTERVAL_MS',
  streamPollOnStart: 'PUBKY_RUNTIME_STREAM_POLL_ON_START',
  streamRespectPageVisibility: 'PUBKY_RUNTIME_STREAM_RESPECT_PAGE_VISIBILITY',
  streamFetchLimit: 'PUBKY_RUNTIME_STREAM_FETCH_LIMIT',
  streamCacheMaxAgeMs: 'PUBKY_RUNTIME_STREAM_CACHE_MAX_AGE_MS',
  maxStreamTags: 'PUBKY_RUNTIME_MAX_STREAM_TAGS',
  ttlPostMs: 'PUBKY_RUNTIME_TTL_POST_MS',
  ttlUserMs: 'PUBKY_RUNTIME_TTL_USER_MS',
  ttlBatchIntervalMs: 'PUBKY_RUNTIME_TTL_BATCH_INTERVAL_MS',
  ttlPostMaxBatchSize: 'PUBKY_RUNTIME_TTL_POST_MAX_BATCH_SIZE',
  ttlUserMaxBatchSize: 'PUBKY_RUNTIME_TTL_USER_MAX_BATCH_SIZE',
  ttlRetryDelayMs: 'PUBKY_RUNTIME_TTL_RETRY_DELAY_MS',
  moderationId: 'PUBKY_RUNTIME_MODERATION_ID',
  moderatedTags: 'PUBKY_RUNTIME_MODERATED_TAGS',
  exchangeRateApi: 'PUBKY_RUNTIME_EXCHANGE_RATE_API',
  preludeSdkKey: 'PUBKY_RUNTIME_PRELUDE_SDK_KEY',
  preludeSdkTimeoutMs: 'PUBKY_RUNTIME_PRELUDE_SDK_TIMEOUT_MS',
  plausibleDomain: 'PUBKY_RUNTIME_PLAUSIBLE_DOMAIN',
  plausibleScriptUrl: 'PUBKY_RUNTIME_PLAUSIBLE_SCRIPT_URL',
  previewImage: 'PUBKY_RUNTIME_PREVIEW_IMAGE',
  siteName: 'PUBKY_RUNTIME_SITE_NAME',
  locale: 'PUBKY_RUNTIME_LOCALE',
  author: 'PUBKY_RUNTIME_AUTHOR',
  keywords: 'PUBKY_RUNTIME_KEYWORDS',
  type: 'PUBKY_RUNTIME_TYPE',
  creator: 'PUBKY_RUNTIME_CREATOR',
  defaultUrl: 'PUBKY_RUNTIME_DEFAULT_URL',
  pubkyRingUrl: 'PUBKY_RUNTIME_PUBKY_RING_URL',
  pubkyCoreUrl: 'PUBKY_RUNTIME_PUBKY_CORE_URL',
  nexusScoutUrl: 'PUBKY_RUNTIME_NEXUS_SCOUT_URL',
  twitterUrl: 'PUBKY_RUNTIME_TWITTER_URL',
  twitterGetpubkyUrl: 'PUBKY_RUNTIME_TWITTER_GETPUBKY_URL',
  telegramUrl: 'PUBKY_RUNTIME_TELEGRAM_URL',
  githubUrl: 'PUBKY_RUNTIME_GITHUB_URL',
  email: 'PUBKY_RUNTIME_EMAIL',
  appStoreUrl: 'PUBKY_RUNTIME_APP_STORE_URL',
  playStoreUrl: 'PUBKY_RUNTIME_PLAY_STORE_URL',
};
