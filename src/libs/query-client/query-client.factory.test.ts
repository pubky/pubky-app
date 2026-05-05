import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('should clear cached data from all registered clients', () => {
    const client = createQueryClient(createTestConfig());

    client.setQueryData(['test-key'], { value: 'cached' });
    expect(client.getQueryData(['test-key'])).toEqual({ value: 'cached' });

    clearAllQueryClients();

    expect(client.getQueryData(['test-key'])).toBeUndefined();
  });
});
