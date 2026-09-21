import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { createQueryClient, createRetryPolicy, type RetryPolicy } from '@/libs/query-client/query-client.factory';
import type { RetryConfig } from '@/libs/query-client/query-client.types';

/**
 * Retry configuration shared by every Nexus query.
 *
 * 404s are transient because Nexus indexes content asynchronously, so content that
 * returns 404 may become available shortly after, so the budget is sized for that
 * indexing window, not for a missing resource.
 */
export const NEXUS_RETRY_CONFIG: RetryConfig = {
  // Don't retry client errors (400), internal errors, or malformed responses
  nonRetryable: [ClientErrorCode.BAD_REQUEST, ServerErrorCode.INTERNAL_ERROR, ServerErrorCode.INVALID_RESPONSE],
  limits: {
    notFound: 5,
    serverError: 3,
    // Rate limits: a single retry after the hard 429 backoff. Retrying 3x
    // into a closed window amplified the burst (Sentry PUBKY-APP-B3).
    rateLimited: 1,
    default: 3,
  },
  delays: {
    notFound: { initial: 500, max: 10_000 },
    serverError: { initial: 1_000, max: 30_000 },
    default: { initial: 1_000, max: 30_000 },
  },
};

/**
 * Nexus API Query Client
 *
 */
export const nexusQueryClient = createQueryClient({
  retry: NEXUS_RETRY_CONFIG,
  staleTime: 20_000,
});

/**
 * Retry policy for a Nexus query that needs its own not-found budget.
 *
 * The 404 budget exists for asynchronous indexing, and reads that feed a page or a
 * stream keep the shared one. A read whose 404 is a verdict the user is waiting on
 * (a profile lookup, where the not-found state is a whole page) uses a shorter budget
 * so the verdict is not parked behind the full indexing window. Only the 404 attempt
 * count changes: 5xx and 429 retries, non-retryable codes and delays stay the shared
 * Nexus configuration.
 *
 * TanStack replaces the client-level `retry` option when a query sets its own, so this
 * returns the whole policy rather than a limit.
 *
 * @param notFoundRetries - 404 attempts allowed after the first (0 = none)
 * @returns The scoped retry policy
 */
export function nexusRetryPolicy(notFoundRetries: number): RetryPolicy {
  return createRetryPolicy({
    ...NEXUS_RETRY_CONFIG,
    limits: { ...NEXUS_RETRY_CONFIG.limits, notFound: notFoundRetries },
  });
}
