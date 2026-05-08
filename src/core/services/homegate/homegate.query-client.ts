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
