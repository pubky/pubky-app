import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexerController } from '@/controllers/indexer/indexer';
import type { RuntimeStatus } from '@/libs/indexer/runtime.types';
import { selectFirstSyncPending, useLocalIndexStatus } from './useLocalIndexStatus';

const fake = vi.hoisted(() => ({
  status: null as unknown,
  listeners: new Set<() => void>(),
}));

vi.mock('@/controllers/indexer/indexer', () => ({
  IndexerController: {
    getLocalIndexStatus: vi.fn(() => fake.status),
    subscribeLocalIndexStatus: vi.fn((listener: () => void) => {
      fake.listeners.add(listener);
      return () => fake.listeners.delete(listener);
    }),
  },
}));

const statusOf = (overrides: Partial<RuntimeStatus> = {}): RuntimeStatus => ({
  state: 'syncing',
  seed: 'alice-pubky',
  lastSyncAt: null,
  lastError: null,
  stats: {
    usersPerHop: [1],
    homeserversSeen: 1,
    homeserversFailed: 0,
    lookups: 1,
    streamRequests: 1,
    bodyRequests: 0,
    events: 3,
  },
  firstSyncPending: true,
  bodiesPending: false,
  bodiesFailing: [],
  asOf: null,
  ...overrides,
});

function report(status: RuntimeStatus | null) {
  fake.status = status;
  for (const listener of fake.listeners) listener();
}

describe('useLocalIndexStatus', () => {
  beforeEach(() => {
    fake.status = null;
    fake.listeners.clear();
  });

  it('passes null while this tab runs no index', () => {
    const { result } = renderHook(() => useLocalIndexStatus((status) => status));

    expect(result.current).toBeNull();
  });

  it('follows each status the index reports, and stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => useLocalIndexStatus((status) => status?.stats.events ?? 0));

    act(() => report(statusOf()));
    expect(result.current).toBe(3);

    act(() => report(statusOf({ stats: { ...statusOf().stats, events: 8 } })));
    expect(result.current).toBe(8);

    unmount();
    expect(fake.listeners.size).toBe(0);
    expect(IndexerController.subscribeLocalIndexStatus).toHaveBeenCalled();
  });
});

describe('selectFirstSyncPending', () => {
  it('is true only for an account whose first sync still runs', () => {
    expect(selectFirstSyncPending(null)).toBe(false);
    expect(selectFirstSyncPending(statusOf())).toBe(true);
    expect(selectFirstSyncPending(statusOf({ firstSyncPending: false }))).toBe(false);
    expect(selectFirstSyncPending(statusOf({ seed: null }))).toBe(false);
  });
});
