import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexerController } from '@/controllers/indexer/indexer';
import type { RuntimeStatus } from '@/libs/indexer/runtime.types';
import { LocalIndexStatus } from './LocalIndexStatus';

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
    syncLocalIndexNow: vi.fn(),
  },
}));

const statusOf = (overrides: Partial<RuntimeStatus> = {}): RuntimeStatus => ({
  state: 'idle',
  seed: 'alice-pubky',
  lastSyncAt: null,
  lastError: null,
  stats: {
    usersPerHop: [1, 12, 140],
    homeserversSeen: 4,
    homeserversFailed: 1,
    lookups: 153,
    streamRequests: 30,
    bodyRequests: 210,
    events: 980,
  },
  firstSyncPending: false,
  bodiesPending: false,
  asOf: null,
  ...overrides,
});

function report(status: RuntimeStatus | null) {
  fake.status = status;
  for (const listener of fake.listeners) listener();
}

const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('LocalIndexStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.status = null;
    fake.listeners.clear();
  });

  it('says so while this tab runs no index', () => {
    render(<LocalIndexStatus />);

    expect(screen.getByText('The local index is not running in this tab.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
  });

  it('shows what the index read, per hop, and updates as it syncs', () => {
    fake.status = statusOf();
    render(<LocalIndexStatus />);

    expect(valueOf('State')).toBe('Idle');
    expect(valueOf('First sync')).toBe('Done');
    expect(valueOf('Tags and counts')).toBe('Done');
    expect(valueOf('Last sync')).toBe('Never');
    expect(valueOf('Users at hop 0')).toBe('1');
    expect(valueOf('Users at hop 2')).toBe('140');
    expect(valueOf('Homeservers reached')).toBe('4');
    expect(valueOf('Homeservers failed')).toBe('1');
    expect(valueOf('Lookups')).toBe('153');
    expect(valueOf('Stream requests')).toBe('30');
    expect(valueOf('File fetches')).toBe('210');
    expect(valueOf('Events')).toBe('980');
    expect(screen.queryByText('Saved index written')).not.toBeInTheDocument();

    act(() =>
      report(
        statusOf({
          state: 'syncing',
          firstSyncPending: true,
          bodiesPending: true,
          stats: { ...statusOf().stats, events: 1200 },
        }),
      ),
    );

    expect(valueOf('State')).toBe('Syncing');
    expect(valueOf('First sync')).toBe('Running');
    expect(valueOf('Tags and counts')).toBe('Loading');
    expect(valueOf('Events')).toBe('1200');
  });

  it('shows the last sync time, the last error and the saved index when present', () => {
    const lastSyncAt = Date.UTC(2026, 10, 25, 12, 0, 0);
    fake.status = statusOf({
      state: 'error',
      lastSyncAt,
      lastError: new Error('homeserver unreachable'),
      savedIndex: { loadedFiles: 2, ignoredFiles: 0, lastSavedAt: null, error: null },
    });
    render(<LocalIndexStatus />);

    expect(valueOf('State')).toBe('Error');
    expect(valueOf('Last sync')).toBe(new Date(lastSyncAt).toLocaleString('en-US'));
    expect(valueOf('Last error')).toBe('homeserver unreachable');
    expect(valueOf('Saved index written')).toBe('Never');
    expect(valueOf('Saved index files loaded')).toBe('2');
  });

  it('syncs now on click, and not while a sync runs', () => {
    fake.status = statusOf();
    render(<LocalIndexStatus />);

    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));
    expect(IndexerController.syncLocalIndexNow).toHaveBeenCalledOnce();

    act(() => report(statusOf({ state: 'syncing' })));
    expect(screen.getByRole('button', { name: /syncing/i })).toBeDisabled();
  });
});
