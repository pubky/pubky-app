import { ValidationErrorCode } from '@/libs/error/error.codes';
import { createQueryClient } from '@/libs/query-client/query-client.factory';

/**
 * Homegate API Query Client
 *
 * Used for caching Homegate API responses like the Lightning verification price.
 */
export const homegateQueryClient = createQueryClient({
  retry: {
    nonRetryable: [ValidationErrorCode.INVALID_INPUT],
    limits: {
      // 429: retry once, after the shared 2s floor (or Retry-After) in query-client.factory.
      // Behavior change: without this key the factory falls back to serverError (3 retries),
      // which is what this client did before; re-firing three times into a closed window only
      // extends it.
      rateLimited: 1,
      serverError: 3,
      default: 3,
    },
    delays: {
      serverError: { initial: 1_000, max: 30_000 },
      default: { initial: 1_000, max: 30_000 },
    },
  },
  // Price doesn't change often, cache for 30 minutes
  staleTime: 30 * 60 * 1000,
});
