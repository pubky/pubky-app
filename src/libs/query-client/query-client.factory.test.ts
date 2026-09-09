import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../error/error';
import { RateLimitErrorCode } from '../error/error.codes';
import { ErrorCategory, ErrorService } from '../error/error.types';
import { clearAllQueryClients, createQueryClient } from './query-client.factory';
import type { QueryClientConfig } from './query-client.types';

const createTestConfig = (): QueryClientConfig => ({
  retry: {
    nonRetryable: [],
    limits: { default: 0 },
    delays: { default: { initial: 100, max: 1000 } },
  },
});

describe('clearAllQueryClients', () => {
  beforeEach(() => {
    // Clear any clients registered by previous tests
    clearAllQueryClients();
  });

  it('should call cancelQueries and clear on all registered query clients', () => {
    const client1 = createQueryClient(createTestConfig());
    const client2 = createQueryClient(createTestConfig());

    const cancelSpy1 = vi.spyOn(client1, 'cancelQueries');
    const clearSpy1 = vi.spyOn(client1, 'clear');
    const cancelSpy2 = vi.spyOn(client2, 'cancelQueries');
    const clearSpy2 = vi.spyOn(client2, 'clear');

    clearAllQueryClients();

    expect(cancelSpy1).toHaveBeenCalledOnce();
    expect(clearSpy1).toHaveBeenCalledOnce();
    expect(cancelSpy2).toHaveBeenCalledOnce();
    expect(clearSpy2).toHaveBeenCalledOnce();
  });

  it('should not throw when called on already-cleared clients', () => {
    // beforeEach already called clearAllQueryClients(), so the registry holds
    // clients from the previous test that have already been cleared.
    // This verifies that clearing them again is safe.
    expect(() => clearAllQueryClients()).not.toThrow();
  });

  describe('retryDelay for 429s', () => {
    const create429Config = (): QueryClientConfig => ({
      retry: {
        nonRetryable: [],
        limits: { default: 0 },
        delays: { default: { initial: 100, max: 30_000 } },
      },
    });

    const delayFor = (client: ReturnType<typeof createQueryClient>) =>
      client.defaultQueryOptions({ queryKey: ['k'] }).retryDelay as (a: number, e: unknown) => number;

    const rateLimitError = (context: Record<string, unknown>) =>
      new AppError({
        category: ErrorCategory.RateLimit,
        code: RateLimitErrorCode.RATE_LIMITED,
        message: 'Too Many Requests',
        service: ErrorService.Nexus,
        operation: 'fetchNexus',
        context,
      });

    it('honors a server Retry-After hint above the 2s floor', () => {
      const delay = delayFor(createQueryClient(create429Config()));
      expect(delay(0, rateLimitError({ statusCode: 429, retryAfter: 7 }))).toBe(7_000);
    });

    it('clamps the Retry-After hint to the configured max', () => {
      const delay = delayFor(createQueryClient(create429Config()));
      expect(delay(0, rateLimitError({ statusCode: 429, retryAfter: 3600 }))).toBe(30_000);
    });

    it('falls back to hard 429 backoff when no Retry-After is present', () => {
      const delay = delayFor(createQueryClient(create429Config()));
      // Fallback: at least 2s, ignoring the configured initial delay (100ms).
      expect(delay(0, rateLimitError({ statusCode: 429 }))).toBe(2_000);
      expect(delay(1, rateLimitError({ statusCode: 429 }))).toBe(2_000);
    });
  });

  it('should clear cached data from all registered clients', () => {
    const client = createQueryClient(createTestConfig());

    client.setQueryData(['test-key'], { value: 'cached' });
    expect(client.getQueryData(['test-key'])).toEqual({ value: 'cached' });

    clearAllQueryClients();

    expect(client.getQueryData(['test-key'])).toBeUndefined();
  });
});
