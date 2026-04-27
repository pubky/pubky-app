import { QueryClient } from '@tanstack/react-query';
import { isAppError } from '../error/error';
import { HttpStatusCode } from '../http/http.types';
import type { QueryClientConfig } from './query-client.types';

const queryClientRegistry: QueryClient[] = [];

/**
 * Cancels and clears all query clients created via createQueryClient.
 */
export function clearAllQueryClients(): void {
  for (const client of queryClientRegistry) {
    client.cancelQueries();
    client.clear();
  }
}

/**
 * Creates a TanStack QueryClient with configurable retry behavior.
 *
 * Each service can define its own retry strategy:
 * - Which error types are non-retryable (permanent failures)
 * - Retry limits per status code category
 * - Exponential backoff delays
 *
 * @param config - Configuration for retry behavior, stale time, and cache time
 * @returns A configured QueryClient instance
 */
export function createQueryClient(config: QueryClientConfig): QueryClient {
  const { retry, staleTime = 0, gcTime = 30 * 60 * 1000 } = config;

  /**
   * Determines if an error should be retried based on configuration.
   */
  function shouldRetry(failureCount: number, error: unknown): boolean {
    if (!isAppError(error)) {
      return failureCount < retry.limits.default;
    }

    const statusCode = error.context?.statusCode as number | undefined;
    const errorCode = error.code;

    // Permanent failures - don't retry
    if (errorCode && retry.nonRetryable.includes(errorCode)) {
      return false;
    }

    // Status code based retry logic
    if (statusCode === HttpStatusCode.NOT_FOUND) {
      return failureCount < (retry.limits.notFound ?? retry.limits.default);
    }

    if (statusCode === HttpStatusCode.TOO_MANY_REQUESTS) {
      return failureCount < (retry.limits.rateLimited ?? retry.limits.serverError ?? retry.limits.default);
    }

    if (statusCode !== undefined && statusCode >= HttpStatusCode.INTERNAL_SERVER_ERROR) {
      return failureCount < (retry.limits.serverError ?? retry.limits.default);
    }

    // Other 4xx: Client errors - don't retry
    if (statusCode !== undefined && statusCode >= HttpStatusCode.BAD_REQUEST) {
      return false;
    }

    return failureCount < retry.limits.default;
  }

  /**
   * Calculates retry delay with exponential backoff.
   * Formula: min(initial * 2^attemptIndex, max)
   */
  function retryDelay(attemptIndex: number, error: unknown): number {
    const delays = retry.delays;

    if (isAppError(error)) {
      const statusCode = error.context?.statusCode as number | undefined;

      // 404: Use notFound delays if configured
      if (statusCode === HttpStatusCode.NOT_FOUND && delays.notFound) {
        return Math.min(delays.notFound.initial * 2 ** attemptIndex, delays.notFound.max);
      }

      // 5xx: Use serverError delays if configured
      if (statusCode !== undefined && statusCode >= HttpStatusCode.INTERNAL_SERVER_ERROR && delays.serverError) {
        return Math.min(delays.serverError.initial * 2 ** attemptIndex, delays.serverError.max);
      }
    }

    // Default delays
    return Math.min(delays.default.initial * 2 ** attemptIndex, delays.default.max);
  }

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: retryDelay,
        staleTime,
        gcTime,
      },
    },
  });

  queryClientRegistry.push(client);

  return client;
}
