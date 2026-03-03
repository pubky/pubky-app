import { createQueryClient, ValidationErrorCode } from '@/libs';

/**
 * Next.js API Query Client
 *
 * Used for caching and deduplicating server-side API requests (e.g., OG metadata fetches).
 * Prevents duplicate fetches for the same URL within the stale time window.
 *
 * NOTE: If a new topic needs different config (e.g. shorter staleTime, different retry),
 * pass overrides in that topic's fetchQuery call instead of changing this shared client.
 */
export const nextjsApiQueryClient = createQueryClient({
  retry: {
    nonRetryable: [ValidationErrorCode.INVALID_INPUT],
    limits: {
      serverError: 2,
      default: 0,
    },
    delays: {
      serverError: { initial: 1_000, max: 5_000 },
      default: { initial: 1_000, max: 5_000 },
    },
  },
  // Match CDN s-maxage (1 hour) for in-memory deduplication
  staleTime: 60 * 60 * 1000,
});
