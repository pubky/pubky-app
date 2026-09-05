import { z } from 'zod';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { parseSessionBridgeAllowlist } from '@/libs/session-bridge/allowlist';

/**
 * Build-time environment schema.
 *
 * Only build-intrinsic public values (baked into the artifact) and server-only variables live
 * here. Everything environment-specific or deployer-facing is runtime-configurable through
 * `PUBKY_RUNTIME_*` and resolved by `@/libs/runtime-config` (see ADR 0017/0018).
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

  // Build-intrinsic release value (package version locally; Git SHA in Docker CI).
  NEXT_PUBLIC_APP_VERSION: z.string(),

  // Test environment variable (optional)
  VITEST: z.string().optional(),

  // Server-side only admin credentials for signup token generation (dev/test only)
  // These are NOT exposed to the client bundle - only available on the server
  HOMESERVER_ADMIN_URL: z.url().default('http://localhost:6288/generate_signup_token'),
  HOMESERVER_ADMIN_PASSWORD: z.string().default('admin'),

  // Server-side Chatwoot configuration (optional in schema, validated at runtime when service is used)
  // These are server-side only and not available in browser, so we make them optional here
  // but ChatwootService.getConfig() will validate they exist when actually needed
  BASE_URL_SUPPORT: z.url().optional(),
  SUPPORT_API_ACCESS_TOKEN: z.string().min(1).optional(),
  SUPPORT_ACCOUNT_ID: z.string().min(1).optional(),

  /**
   * Comma-separated origins allowed to embed /session-bridge and receive sessionExport via postMessage.
   * Supports exact https origins and single-label wildcards (`https://*.vibes.pubky.app`).
   * First-party team-operated hosts are added to the default by exact origin via PR, never by wildcard.
   * Loopback http is allowed only when listed explicitly (e.g. http://localhost:3000).
   * Unset, empty, and whitespace-only values use the NODE_ENV-dependent default.
   * Staging pubky.app deployments are production builds and must set this explicitly.
   */
  NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parseSessionBridgeAllowlist(value);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: error instanceof Error ? error.message : 'Invalid session bridge allowlist',
        });
        return z.NEVER;
      }
    }),
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
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    VITEST: process.env.VITEST,
    HOMESERVER_ADMIN_URL: process.env.HOMESERVER_ADMIN_URL,
    HOMESERVER_ADMIN_PASSWORD: process.env.HOMESERVER_ADMIN_PASSWORD,
    BASE_URL_SUPPORT: process.env.BASE_URL_SUPPORT,
    SUPPORT_API_ACCESS_TOKEN: process.env.SUPPORT_API_ACCESS_TOKEN,
    SUPPORT_ACCOUNT_ID: process.env.SUPPORT_ACCOUNT_ID,
    NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS: process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS,
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

/**
 * Validated environment variables with defaults applied
 * Use this instead of process.env directly
 */
export const Env = parseEnv();
