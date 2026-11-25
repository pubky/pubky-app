import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiSyncMessage } from '@/controllers/pubchi/pubchi-sync';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PubchiSettings } from './Pubchi';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  onSync: undefined as ((message: PubchiSyncMessage) => void) | undefined,
}));

vi.mock('@/libs/pubchi/flags', () => ({ isPubchiEnabled: () => true }));
vi.mock('@/libs/pubchi/device-key', () => ({ getCurrentDeviceKey: async () => undefined }));
vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    loadPubchi: (...args: unknown[]) => mocks.load(...args),
    reconcileActiveBinding: vi.fn().mockResolvedValue(undefined),
    ensureDeviceReady: vi.fn().mockResolvedValue(true),
    listDeviceKeys: vi.fn().mockResolvedValue([]),
    loadPubchiConfig: vi.fn().mockResolvedValue(null),
    loadPubchiContext: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/controllers/pubchi/pubchi-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/controllers/pubchi/pubchi-sync')>()),
  subscribeToPubchiSync: (listener: (message: PubchiSyncMessage) => void) => {
    mocks.onSync = listener;
    return () => {
      mocks.onSync = undefined;
    };
  },
}));
vi.mock('@/stores/auth/auth.store', () => {
  const state = {
    currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    generation: 'sync-feedback-session',
    session: { info: { capabilities: ['/:rw'] } },
  };
  return {
    useAuthStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

function sync() {
  mocks.onSync?.({ owner: OWNER, kind: 'config-saved', at: Date.now() });
}

describe('PubchiSettings sync feedback', () => {
  beforeEach(() => {
    usePubchiStore.getState().clear();
    mocks.load.mockReset().mockResolvedValue(undefined);
    mocks.onSync = undefined;
  });

  it('shows a failed sync with the flyout closed and clears it after Retry sync succeeds', async () => {
    render(<PubchiSettings />);
    await waitFor(() => expect(screen.getByTestId('pubchi-create')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Still here' } });
    mocks.load.mockRejectedValueOnce(new Error('sync unavailable'));

    act(sync);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pubchi could not sync. Your current data is still available.',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Still here');
    expect(usePubchiStore.getState().flyout.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));

    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Still here');
  });

  it('shows the rate-limit pause without a bypass button and clears it after automatic recovery', async () => {
    const { unmount } = render(<PubchiSettings />);
    await waitFor(() => expect(screen.getByTestId('pubchi-create')).toBeInTheDocument());
    vi.useFakeTimers();
    try {
      for (let index = 0; index < 6; index += 1) {
        await act(async () => {
          sync();
          await vi.advanceTimersByTimeAsync(200);
        });
      }
      expect(mocks.load).toHaveBeenCalledTimes(6);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Pubchi sync is paused briefly. It will retry automatically.',
      );
      expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument();
      expect(screen.getByTestId('pubchi-create')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(mocks.load).toHaveBeenCalledTimes(7);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});
