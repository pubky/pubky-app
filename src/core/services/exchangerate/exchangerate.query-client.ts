import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { createQueryClient } from '@/libs/query-client/query-client.factory';

/**
 * Exchange Rate API Query Client
 *
 * Used for caching BTC/USD exchange rate responses from BlockTank API.
 * The exchange rate is cached for 30 minutes since it doesn't need
 * real-time precision for display purposes.
 */
export const exchangerateQueryClient = createQueryClient({
  retry: {
    // INVALID_RESPONSE: Malformed API response - won't change on retry
    // NOT_FOUND: BTCUSD ticker missing - permanent failure
    nonRetryable: [ServerErrorCode.INVALID_RESPONSE, ClientErrorCode.NOT_FOUND],
    limits: {
      serverError: 3,
      default: 3,
    },
    delays: {
      serverError: { initial: 1_000, max: 30_000 },
      default: { initial: 1_000, max: 30_000 },
    },
  },
  // Exchange rate doesn't need real-time precision, cache for 30 minutes
  staleTime: 30 * 60 * 1000,
});
