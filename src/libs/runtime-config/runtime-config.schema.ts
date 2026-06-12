import { z } from 'zod';

/**
 * Shared, zod-only schema for the environment-specific values that must be configurable at
 * RUNTIME (so a single Docker image works across staging/prod/testnet and can be deployed by
 * third parties against their own infrastructure).
 *
 * The config has two tiers:
 *  - REQUIRED network values (nexusUrl, cdnUrl, ...): a deployed container must set all of
 *    them; partial config fails loudly instead of silently resolving to staging defaults.
 *  - OPTIONAL observability values (sentry*): absent means the feature is disabled (DSN) or
 *    a documented default applies (sample rates).
 *
 * This module is a leaf (zod only, no `Env`, no logger) so that:
 *  - `env.ts` and the runtime-config resolver cannot drift on what counts as valid, and
 *  - the runtime-config resolver never pulls in the heavy `env -> libs/error -> logger -> env`
 *    import cycle.
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

export const urlValue = z.url();
export const homeserverValue = z.string().min(1);
export const pkarrRelaysValue = z.array(z.url()).min(1);
export const testnetValue = z.boolean();
export const sampleRateValue = z.number().min(0).max(1);

/**
 * Parse a `PKARR_RELAYS` JSON-array string into a string[]. Throws on malformed input.
 * Shared by both the strict runtime parse and env.ts (which wraps it with a lenient fallback).
 */
export function parsePkarrRelaysString(val: string): string[] {
  const parsed: unknown = JSON.parse(val);
  if (!Array.isArray(parsed)) {
    throw new Error('PKARR_RELAYS must be a JSON array');
  }
  for (const relay of parsed) {
    if (typeof relay !== 'string') {
      throw new Error('Each PKARR relay must be a string');
    }
  }
  return parsed as string[];
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

const testnetFromString = z.string().transform((val) => val === 'true');

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

/** Rates validate eagerly (bad number/range throws here); the default applies in the value schema. */
const sampleRateFromString = z
  .string()
  .transform((val) => parseFloat(val))
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
 * Parsed runtime config (required network tier + OPTIONAL observability tier).
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
});

export type RuntimeConfig = z.infer<typeof runtimeConfigValueSchema>;

/**
 * Strict env-input schema (string inputs -> parsed `RuntimeConfig`). NO defaults for the
 * required network tier: a missing value THROWS. Used for the production parse of
 * `PUBKY_RUNTIME_*` so partial deploy config fails loudly instead of silently resolving to a
 * staging URL. The optional Sentry tier stays optional here (absent = disabled / documented
 * sample-rate default).
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
 * Env-input schema WITH staging defaults layered. Used only by the dev/test fallback over
 * `NEXT_PUBLIC_*` (never for the production `PUBKY_RUNTIME_*` parse).
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
  })
  .pipe(runtimeConfigValueSchema);

// ---------------------------------------------------------------------------
// Env-name <-> config-key mapping
// ---------------------------------------------------------------------------

/**
 * Runtime env var names (non-NEXT_PUBLIC, so Next does not inline them at build time).
 * Their VALUES are supplied at container runtime; they are PUBLIC values, not secrets.
 */
export const PUBKY_RUNTIME_ENV_NAMES: Record<keyof RuntimeConfig, string> = {
  nexusUrl: 'PUBKY_RUNTIME_NEXUS_URL',
  cdnUrl: 'PUBKY_RUNTIME_CDN_URL',
  homeserver: 'PUBKY_RUNTIME_HOMESERVER',
  homeserverUrl: 'PUBKY_RUNTIME_HOMESERVER_URL',
  homegateUrl: 'PUBKY_RUNTIME_HOMEGATE_URL',
  defaultHttpRelay: 'PUBKY_RUNTIME_DEFAULT_HTTP_RELAY',
  pkarrRelays: 'PUBKY_RUNTIME_PKARR_RELAYS',
  testnet: 'PUBKY_RUNTIME_TESTNET',
  sentryDsn: 'PUBKY_RUNTIME_SENTRY_DSN',
  sentryEnvironment: 'PUBKY_RUNTIME_SENTRY_ENVIRONMENT',
  sentryTracesSampleRate: 'PUBKY_RUNTIME_SENTRY_TRACES_SAMPLE_RATE',
  sentryReplaysSessionSampleRate: 'PUBKY_RUNTIME_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
  sentryReplaysOnErrorSampleRate: 'PUBKY_RUNTIME_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
};

/**
 * Build-time / local default env var names. Used only by the dev/test fallback.
 */
export const NEXT_PUBLIC_ENV_NAMES: Record<keyof RuntimeConfig, string> = {
  nexusUrl: 'NEXT_PUBLIC_NEXUS_URL',
  cdnUrl: 'NEXT_PUBLIC_CDN_URL',
  homeserver: 'NEXT_PUBLIC_HOMESERVER',
  homeserverUrl: 'NEXT_PUBLIC_HOMESERVER_URL',
  homegateUrl: 'NEXT_PUBLIC_HOMEGATE_URL',
  defaultHttpRelay: 'NEXT_PUBLIC_DEFAULT_HTTP_RELAY',
  pkarrRelays: 'NEXT_PUBLIC_PKARR_RELAYS',
  testnet: 'NEXT_PUBLIC_TESTNET',
  sentryDsn: 'NEXT_PUBLIC_SENTRY_DSN',
  sentryEnvironment: 'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
  sentryTracesSampleRate: 'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
  sentryReplaysSessionSampleRate: 'NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
  sentryReplaysOnErrorSampleRate: 'NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
};
