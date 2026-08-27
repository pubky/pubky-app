import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { createQueryClient } from '@/libs/query-client/query-client.factory';

/**
 * Exchange Rate API Query Client
 *
 * Caches BTC/USD rate responses from the BlockTank API. The rate is only ever shown next to an
 * amount the user is choosing, never used to compute what is charged, so a short cache is enough.
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
  staleTime: 60 * 1000,
});
