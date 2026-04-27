import { createQueryClient } from '@/libs/query-client/query-client.factory';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';

/**
 * Nexus API Query Client
 *
 */
export const nexusQueryClient = createQueryClient({
  retry: {
    // Don't retry client errors (400), internal errors, or malformed responses
    nonRetryable: [ClientErrorCode.BAD_REQUEST, ServerErrorCode.INTERNAL_ERROR, ServerErrorCode.INVALID_RESPONSE],
    limits: {
      // 404 errors are transient because Nexus indexes content asynchronously,
      // so content that returns 404 may become available shortly after.
      notFound: 5,
      serverError: 3,
      default: 3,
    },
    delays: {
      notFound: { initial: 500, max: 10_000 },
      serverError: { initial: 1_000, max: 30_000 },
      default: { initial: 1_000, max: 30_000 },
    },
  },
  staleTime: 20_000,
});
