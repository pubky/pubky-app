import { z } from 'zod';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import {
  homeserverValue,
  NETWORK_RUNTIME_DEFAULTS,
  parsePkarrRelaysString,
  pkarrRelaysValue,
  testnetValue,
  urlValue,
} from '@/libs/runtime-config/runtime-config.schema';

/**
 * Build-time and local fallback environment schema.
 *
 * Deployed/public Docker configuration is resolved through `PUBKY_RUNTIME_*`
 * in `@/libs/runtime-config`. The `NEXT_PUBLIC_*` values below are retained
 * only for build-intrinsic values and local dev/test fallback inputs.
 */

// Schema for environment variables
const envSchema = z.object({
  // Node.js environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Build-intrinsic public values. These are intentionally baked into the artifact.
  NEXT_PUBLIC_DB_NAME: z.string().default('franky'),
  NEXT_PUBLIC_DB_VERSION: z
    .string()
    .default('2')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_DEBUG_MODE: z
    .string()
    .default('false')
    .transform((val) => val === 'true')
    .pipe(z.boolean()),

  // =============================================================================
  // RUNTIME-CONFIG FALLBACKS (local dev/test only)
  // =============================================================================
  // These NEXT_PUBLIC_* names feed the runtime-config fallback used by local dev/tests.
  // Deployed containers must use PUBKY_RUNTIME_* instead. Keep validation/defaults aligned
  // with `src/libs/runtime-config/runtime-config.schema.ts`.
  /** Main API endpoint */
  NEXT_PUBLIC_NEXUS_URL: urlValue.default(NETWORK_RUNTIME_DEFAULTS.nexusUrl),
  /** CDN URL for static assets */
  NEXT_PUBLIC_CDN_URL: urlValue.default(NETWORK_RUNTIME_DEFAULTS.cdnUrl),

  NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL_MS: z
    .string()
    .default('8888') // 8888 milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_NOTIFICATION_POLL_ON_START: z
    .string()
    .default('true')
    .transform((val) => val === 'true')
    .pipe(z.boolean()),

  NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY: z
    .string()
    .default('true')
    .transform((val) => val === 'true')
    .pipe(z.boolean()),

  NEXT_PUBLIC_STREAM_POLL_INTERVAL_MS: z
    .string()
    .default('8888') // 8888 milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_STREAM_POLL_ON_START: z
    .string()
    .default('false')
    .transform((val) => val === 'true')
    .pipe(z.boolean()),

  NEXT_PUBLIC_STREAM_RESPECT_PAGE_VISIBILITY: z
    .string()
    .default('true')
    .transform((val) => val === 'true')
    .pipe(z.boolean()),

  NEXT_PUBLIC_STREAM_FETCH_LIMIT: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_STREAM_CACHE_MAX_AGE_MS: z
    .string()
    .default('300000') // 5 minutes in milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TTL_POST_MS: z
    .string()
    .default('300000') // 5 minutes in milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TTL_USER_MS: z
    .string()
    .default('600000') // 10 minutes in milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TTL_BATCH_INTERVAL_MS: z
    .string()
    .default('5000') // 5 seconds in milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TTL_POST_MAX_BATCH_SIZE: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TTL_USER_MAX_BATCH_SIZE: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TTL_RETRY_DELAY_MS: z
    .string()
    .default('60000') // 1 minute in milliseconds
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_TESTNET: z
    .string()
    .default(String(NETWORK_RUNTIME_DEFAULTS.testnet))
    .transform((val) => val === 'true')
    .pipe(testnetValue),

  NEXT_MAX_STREAM_TAGS: z
    .string()
    .default('5')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NEXT_PUBLIC_PKARR_RELAYS: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined))
    .default(JSON.stringify(NETWORK_RUNTIME_DEFAULTS.pkarrRelays))
    .transform(parsePkarrRelays)
    .pipe(pkarrRelaysValue),

  NEXT_PUBLIC_HOMESERVER: homeserverValue.default(NETWORK_RUNTIME_DEFAULTS.homeserver),

  NEXT_PUBLIC_HOMESERVER_URL: urlValue.default(NETWORK_RUNTIME_DEFAULTS.homeserverUrl),

  // Server-side only admin credentials for signup token generation (dev/test only)
  // These are NOT exposed to the client bundle - only available on the server
  HOMESERVER_ADMIN_URL: z.url().default('http://localhost:6288/generate_signup_token'),
  HOMESERVER_ADMIN_PASSWORD: z.string().default('admin'),

  NEXT_PUBLIC_DEFAULT_HTTP_RELAY: urlValue.default(NETWORK_RUNTIME_DEFAULTS.defaultHttpRelay),
  NEXT_PUBLIC_MODERATION_ID: z.string().default('euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro'),
  NEXT_PUBLIC_MODERATED_TAGS: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined))
    .default('["nudity"]')
    .transform((val) => JSON.parse(val))
    .pipe(z.array(z.string().min(1)).min(1)),
  NEXT_PUBLIC_EXCHANGE_RATE_API: z.url().default('https://api1.blocktank.to/api/fx/rates/btc'),
  NEXT_PUBLIC_HOMEGATE_URL: urlValue.default(NETWORK_RUNTIME_DEFAULTS.homegateUrl),

  NEXT_PUBLIC_PRELUDE_SDK_KEY: z.string().optional(),

  NEXT_PUBLIC_PRELUDE_SDK_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // Test environment variable (optional)
  VITEST: z.string().optional(),

  // Server-side Chatwoot configuration (optional in schema, validated at runtime when service is used)
  // These are server-side only and not available in browser, so we make them optional here
  // but ChatwootService.getConfig() will validate they exist when actually needed
  BASE_URL_SUPPORT: z.string().url().optional(),
  SUPPORT_API_ACCESS_TOKEN: z.string().min(1).optional(),
  SUPPORT_ACCOUNT_ID: z.string().min(1).optional(),
  SUPPORT_FEEDBACK_INBOX_ID: z
    .string()
    .min(1)
    .optional()
    .default('26')
    .transform((val) => parseInt(val, 10)),

  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: z.url().optional(),

  NEXT_PUBLIC_PREVIEW_IMAGE: z.string().optional().default('/preview.webp'),
  NEXT_PUBLIC_SITE_NAME: z.string().optional().default('Pubky App'),
  NEXT_PUBLIC_LOCALE: z.string().optional().default('en_US'),
  NEXT_PUBLIC_AUTHOR: z.string().optional().default('Pubky Team'),
  NEXT_PUBLIC_KEYWORDS: z.string().optional().default('pubky, social media, decentralized, key, pkarr, pubky core'),
  NEXT_PUBLIC_TYPE: z.string().optional().default('website'),
  NEXT_PUBLIC_CREATOR: z.string().optional().default('@getpubky'),
  NEXT_PUBLIC_DEFAULT_URL: z.string().optional().default('https://pubky.app'),

  NEXT_PUBLIC_PUBKY_RING_URL: z.string().optional().default('https://pubkyring.app/'),
  NEXT_PUBLIC_PUBKY_CORE_URL: z.string().optional().default('https://pubky.org'),
  NEXT_PUBLIC_TWITTER_URL: z.string().optional().default('https://x.com/pubky'),
  NEXT_PUBLIC_TWITTER_GETPUBKY_URL: z.string().optional().default('https://x.com/getpubky'),
  NEXT_PUBLIC_TELEGRAM_URL: z.string().optional().default('https://t.me/pubkychat'),
  NEXT_PUBLIC_GITHUB_URL: z.string().optional().default('https://github.com/pubky'),
  NEXT_PUBLIC_EMAIL: z.string().optional().default('hello@pubky.com'),
  NEXT_PUBLIC_APP_STORE_URL: z.string().optional().default('https://apps.apple.com/app/pubky-ring/id6739356756'),
  NEXT_PUBLIC_PLAY_STORE_URL: z
    .string()
    .optional()
    .default('https://play.google.com/store/apps/details?id=to.pubky.ring&pcampaignid=web_share'),

  // Build-intrinsic release value (package version locally; Git SHA in Docker CI).
  NEXT_PUBLIC_APP_VERSION: z.string(),

  // Sentry fallback names are intentionally handled in runtime-config.schema.ts, not here.
});

/**
 * Format a Zod error into a human-readable message for DevOps
 */
function formatEnvError(error: z.ZodError): string {
  const separator = '='.repeat(70);
  const lines: string[] = [
    '',
    separator,
    'ENVIRONMENT CONFIGURATION ERROR',
    separator,
    '',
    'The following environment variables are missing or invalid:',
    '',
  ];

  // Group errors by type: missing vs invalid
  const missingVars: string[] = [];
  const invalidVars: { name: string; message: string; received?: unknown }[] = [];

  for (const issue of error.issues) {
    const varName = issue.path.join('.');
    const hasReceived = 'received' in issue;
    const received = hasReceived ? (issue as { received?: unknown }).received : undefined;

    // Detect missing variables:
    // - received is explicitly 'undefined' (string) - Zod type error for undefined value
    // - message contains "received undefined" - Zod validation message pattern
    const isMissing =
      received === 'undefined' || (typeof issue.message === 'string' && issue.message.includes('received undefined'));

    if (isMissing) {
      missingVars.push(varName);
    } else {
      invalidVars.push({
        name: varName,
        message: issue.message,
        received: hasReceived ? received : undefined,
      });
    }
  }

  // Format missing variables
  if (missingVars.length > 0) {
    lines.push('MISSING VARIABLES (required but not set):');
    for (const varName of missingVars) {
      lines.push(`  - ${varName}`);
    }
    lines.push('');
  }

  // Format invalid variables
  if (invalidVars.length > 0) {
    lines.push('INVALID VARIABLES (set but with wrong format/value):');
    for (const { name, message, received } of invalidVars) {
      const receivedInfo = received !== undefined ? ` (received: ${JSON.stringify(received)})` : '';
      lines.push(`  - ${name}: ${message}${receivedInfo}`);
    }
    lines.push('');
  }

  // Add helpful hints
  lines.push('HOW TO FIX:');
  lines.push('  1. Check your .env file or Docker build args');
  lines.push('  2. Refer to .env.example for required variables and formats');
  lines.push('  3. Ensure all required URLs are valid (include https://)');
  lines.push('');
  lines.push(separator);
  lines.push('');

  return lines.join('\n');
}

/**
 * Parse and validate environment variables
 * Throws an error if validation fails with clear DevOps-friendly messages
 */
function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_DB_NAME: process.env.NEXT_PUBLIC_DB_NAME,
    NEXT_PUBLIC_DB_VERSION: process.env.NEXT_PUBLIC_DB_VERSION,
    NEXT_PUBLIC_DEBUG_MODE: process.env.NEXT_PUBLIC_DEBUG_MODE,
    NEXT_PUBLIC_NEXUS_URL: process.env.NEXT_PUBLIC_NEXUS_URL,
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
    NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL_MS: process.env.NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL_MS,
    NEXT_PUBLIC_NOTIFICATION_POLL_ON_START: process.env.NEXT_PUBLIC_NOTIFICATION_POLL_ON_START,
    NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY: process.env.NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY,
    NEXT_MAX_STREAM_TAGS: process.env.NEXT_MAX_STREAM_TAGS,
    NEXT_PUBLIC_STREAM_POLL_INTERVAL_MS: process.env.NEXT_PUBLIC_STREAM_POLL_INTERVAL_MS,
    NEXT_PUBLIC_STREAM_POLL_ON_START: process.env.NEXT_PUBLIC_STREAM_POLL_ON_START,
    NEXT_PUBLIC_STREAM_RESPECT_PAGE_VISIBILITY: process.env.NEXT_PUBLIC_STREAM_RESPECT_PAGE_VISIBILITY,
    NEXT_PUBLIC_STREAM_FETCH_LIMIT: process.env.NEXT_PUBLIC_STREAM_FETCH_LIMIT,
    NEXT_PUBLIC_STREAM_CACHE_MAX_AGE_MS: process.env.NEXT_PUBLIC_STREAM_CACHE_MAX_AGE_MS,
    NEXT_PUBLIC_TTL_POST_MS: process.env.NEXT_PUBLIC_TTL_POST_MS,
    NEXT_PUBLIC_TTL_USER_MS: process.env.NEXT_PUBLIC_TTL_USER_MS,
    NEXT_PUBLIC_TTL_BATCH_INTERVAL_MS: process.env.NEXT_PUBLIC_TTL_BATCH_INTERVAL_MS,
    NEXT_PUBLIC_TTL_POST_MAX_BATCH_SIZE: process.env.NEXT_PUBLIC_TTL_POST_MAX_BATCH_SIZE,
    NEXT_PUBLIC_TTL_USER_MAX_BATCH_SIZE: process.env.NEXT_PUBLIC_TTL_USER_MAX_BATCH_SIZE,
    NEXT_PUBLIC_TTL_RETRY_DELAY_MS: process.env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS,
    NEXT_PUBLIC_TESTNET: process.env.NEXT_PUBLIC_TESTNET,
    NEXT_PUBLIC_PKARR_RELAYS: process.env.NEXT_PUBLIC_PKARR_RELAYS,
    NEXT_PUBLIC_HOMESERVER: process.env.NEXT_PUBLIC_HOMESERVER,
    NEXT_PUBLIC_HOMESERVER_URL: process.env.NEXT_PUBLIC_HOMESERVER_URL,
    HOMESERVER_ADMIN_URL: process.env.HOMESERVER_ADMIN_URL,
    HOMESERVER_ADMIN_PASSWORD: process.env.HOMESERVER_ADMIN_PASSWORD,
    NEXT_PUBLIC_DEFAULT_HTTP_RELAY: process.env.NEXT_PUBLIC_DEFAULT_HTTP_RELAY,
    NEXT_PUBLIC_MODERATION_ID: process.env.NEXT_PUBLIC_MODERATION_ID,
    NEXT_PUBLIC_MODERATED_TAGS: process.env.NEXT_PUBLIC_MODERATED_TAGS,
    NEXT_PUBLIC_EXCHANGE_RATE_API: process.env.NEXT_PUBLIC_EXCHANGE_RATE_API,
    NEXT_PUBLIC_HOMEGATE_URL: process.env.NEXT_PUBLIC_HOMEGATE_URL,
    NEXT_PUBLIC_PRELUDE_SDK_KEY: process.env.NEXT_PUBLIC_PRELUDE_SDK_KEY,
    NEXT_PUBLIC_PRELUDE_SDK_TIMEOUT_MS: process.env.NEXT_PUBLIC_PRELUDE_SDK_TIMEOUT_MS,
    VITEST: process.env.VITEST,
    BASE_URL_SUPPORT: process.env.BASE_URL_SUPPORT,
    SUPPORT_API_ACCESS_TOKEN: process.env.SUPPORT_API_ACCESS_TOKEN,
    SUPPORT_ACCOUNT_ID: process.env.SUPPORT_ACCOUNT_ID,
    SUPPORT_FEEDBACK_INBOX_ID: process.env.SUPPORT_FEEDBACK_INBOX_ID,
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,
    NEXT_PUBLIC_PREVIEW_IMAGE: process.env.NEXT_PUBLIC_PREVIEW_IMAGE,
    NEXT_PUBLIC_DEFAULT_URL: process.env.NEXT_PUBLIC_DEFAULT_URL,
    NEXT_PUBLIC_LOCALE: process.env.NEXT_PUBLIC_LOCALE,
    NEXT_PUBLIC_AUTHOR: process.env.NEXT_PUBLIC_AUTHOR,
    NEXT_PUBLIC_KEYWORDS: process.env.NEXT_PUBLIC_KEYWORDS,
    NEXT_PUBLIC_TYPE: process.env.NEXT_PUBLIC_TYPE,
    NEXT_PUBLIC_CREATOR: process.env.NEXT_PUBLIC_CREATOR,
    NEXT_PUBLIC_PUBKY_RING_URL: process.env.NEXT_PUBLIC_PUBKY_RING_URL,
    NEXT_PUBLIC_PUBKY_CORE_URL: process.env.NEXT_PUBLIC_PUBKY_CORE_URL,
    NEXT_PUBLIC_TWITTER_URL: process.env.NEXT_PUBLIC_TWITTER_URL,
    NEXT_PUBLIC_TWITTER_GETPUBKY_URL: process.env.NEXT_PUBLIC_TWITTER_GETPUBKY_URL,
    NEXT_PUBLIC_TELEGRAM_URL: process.env.NEXT_PUBLIC_TELEGRAM_URL,
    NEXT_PUBLIC_GITHUB_URL: process.env.NEXT_PUBLIC_GITHUB_URL,
    NEXT_PUBLIC_EMAIL: process.env.NEXT_PUBLIC_EMAIL,
    NEXT_PUBLIC_APP_STORE_URL: process.env.NEXT_PUBLIC_APP_STORE_URL,
    NEXT_PUBLIC_PLAY_STORE_URL: process.env.NEXT_PUBLIC_PLAY_STORE_URL,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  });

  if (!result.success) {
    const formattedError = formatEnvError(result.error);

    // Print the formatted error to console for clear visibility during build/startup
    console.error(formattedError);

    // Also throw an error with structured details for programmatic handling
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Environment configuration validation failed', {
      service: ErrorService.Local,
      operation: 'parseEnv',
      context: {
        issues: result.error.issues.map((issue) => ({
          variable: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
    });
  }

  return result.data;
}

function parsePkarrRelays(val: string): string[] {
  try {
    return parsePkarrRelaysString(val);
  } catch {
    // Using console.warn here instead of Logger.warn due to circular dependency:
    // env.ts must load before Logger is available (env -> libs -> logger)
    console.warn(`Invalid NEXT_PUBLIC_PKARR_RELAYS value: "${val}", using defaults`);
    return NETWORK_RUNTIME_DEFAULTS.pkarrRelays;
  }
}

/**
 * Validated environment variables with defaults applied
 * Use this instead of process.env directly
 */
export const Env = parseEnv();
