import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../error/error';
import { ErrorCategory, ErrorService } from '../error/error.types';
import { RateLimitErrorCode } from '../error/error.codes';
import { getRetryAfter } from '../error/error.utils';
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

  it('retryDelay honors a server Retry-After hint above the 2s floor', () => {
    const client = createQueryClient(createTestConfig());
    const error = new AppError({
      category: ErrorCategory.RateLimit,
      code: RateLimitErrorCode.RATE_LIMITED,
      message: 'Too Many Requests',
      service: ErrorService.Nexus,
      operation: 'fetchNexus',
      context: { statusCode: 429, retryAfter: 7 },
    });

    // 7s hint must win over the fallback backoff (which would cap at 1s here).
    const delay = client.defaultQueryOptions({ queryKey: ['k'] }).retryDelay as (a: number, e: unknown) => number;
    expect(delay(0, error)).toBe(7_000);
  });

  it('retryDelay falls back to hard 429 backoff when no Retry-After is present', () => {
    const client = createQueryClient(createTestConfig());
    const error = new AppError({
      category: ErrorCategory.RateLimit,
      code: RateLimitErrorCode.RATE_LIMITED,
      message: 'Too Many Requests',
      service: ErrorService.Nexus,
      operation: 'fetchNexus',
      context: { statusCode: 429 },
    });

    // Fallback: at least 2s, ignoring the configured initial delay (100ms).
    const delay = client.defaultQueryOptions({ queryKey: ['k'] }).retryDelay as (a: number, e: unknown) => number;
    expect(delay(0, error)).toBe(2_000);
    expect(delay(1, error)).toBe(2_000);
  });

  it('should clear cached data from all registered clients', () => {
    const client = createQueryClient(createTestConfig());

    client.setQueryData(['test-key'], { value: 'cached' });
    expect(client.getQueryData(['test-key'])).toEqual({ value: 'cached' });

    clearAllQueryClients();

    expect(client.getQueryData(['test-key'])).toBeUndefined();
  });
});
