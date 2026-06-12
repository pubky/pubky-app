import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import {
  NEXT_PUBLIC_ENV_NAMES,
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
 * - dev/test: falls back to `NEXT_PUBLIC_*` (honoring `.env.local` / `src/config/test.ts`).
 *
 * This module must NOT import `Env` (keeps the import graph a leaf, avoids the env<->logger cycle).
 */

export const RUNTIME_CONFIG_WINDOW_KEY = '__PUBKY_CONFIG__' as const;

declare global {
  interface Window {
    [RUNTIME_CONFIG_WINDOW_KEY]?: unknown;
  }
}

let memoizedConfig: RuntimeConfig | null = null;

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

/**
 * dev/test fallback: parse `NEXT_PUBLIC_*` (readable at runtime under `next dev` and Vitest)
 * through the defaulted schema, so local `.env.local` and test overrides are honored and
 * staging defaults fill the gaps.
 */
function parseFallbackConfig(): RuntimeConfig {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(NEXT_PUBLIC_ENV_NAMES) as (keyof RuntimeConfig)[]) {
    input[key] = process.env[NEXT_PUBLIC_ENV_NAMES[key]];
  }
  return runtimeEnvInputSchemaWithDefaults.parse(input);
}

/** Exported for unit tests; prefer `getRuntimeConfig()` in app code. */
export function readServerConfig(): RuntimeConfig {
  const input: Record<string, string | undefined> = {};
  let anyPresent = false;
  for (const key of Object.keys(PUBKY_RUNTIME_ENV_NAMES) as (keyof RuntimeConfig)[]) {
    const value = process.env[PUBKY_RUNTIME_ENV_NAMES[key]];
    input[key] = value;
    if (value !== undefined && value !== '') anyPresent = true;
  }

  // Any PUBKY_RUNTIME_* present means we strictly require ALL of them (catches partial config).
  if (anyPresent) {
    return runtimeEnvInputSchema.parse(input);
  }

  if (isRuntimeConfigRequired() && !isProductionBuildPhase()) {
    throw new Error(
      'Runtime config is required but no PUBKY_RUNTIME_* environment variables are set. ' +
        'Set PUBKY_RUNTIME_NEXUS_URL, PUBKY_RUNTIME_CDN_URL, PUBKY_RUNTIME_HOMESERVER, ' +
        'PUBKY_RUNTIME_HOMESERVER_URL, PUBKY_RUNTIME_HOMEGATE_URL, PUBKY_RUNTIME_DEFAULT_HTTP_RELAY, ' +
        'PUBKY_RUNTIME_PKARR_RELAYS, and PUBKY_RUNTIME_TESTNET on the container. ' +
        'The PUBKY_RUNTIME_SENTRY_* variables are optional (absent disables Sentry).',
    );
  }

  return parseFallbackConfig();
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

  return parseFallbackConfig();
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
