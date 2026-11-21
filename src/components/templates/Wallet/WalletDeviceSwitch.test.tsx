import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RingDeviceStatus } from '@/services/wallet/ring-enrollment';
import { type DeviceAction, WalletDeviceSwitch } from './WalletDeviceSwitch';

vi.mock('./WalletKeyApproval', () => ({
  WalletKeyApproval: () => <p>Approve in Ring</p>,
}));

type State = RingDeviceStatus['state'];

function renderWaiting(read: (signal: AbortSignal) => Promise<State>) {
  const approve = vi.fn();
  function Destination() {
    const [action, setAction] = useState<DeviceAction>('elsewhere');
    return (
      <WalletDeviceSwitch
        account={'y'.repeat(52)}
        network="regtest"
        action={action}
        onRefresh={async (signal) => {
          const state = await read(signal);
          if (signal.aborted) return;
          if (state === 'handoff-ready') setAction('take');
          return state;
        }}
        onApprove={approve}
        onClose={vi.fn()}
      />
    );
  }
  return { ...render(<Destination />), approve };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('a wallet waiting on the destination device', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('discovers a prepared transfer on the open page and waits for explicit Ring approval', async () => {
    const read = vi.fn<() => Promise<State>>().mockResolvedValueOnce('other-device').mockResolvedValue('handoff-ready');
    const { approve } = renderWaiting(read);
    await advance(5000);
    expect(screen.getByText('Still waiting for your other device.')).toBeVisible();
    await advance(5000);
    const take = screen.getByRole('button', { name: 'Use wallet on this device' });
    expect(take).toBeEnabled();
    expect(screen.queryByText('Still waiting for your other device.')).toBeNull();
    expect(screen.queryByText('Approve in Ring')).toBeNull();
    await advance(60_000);
    expect(read).toHaveBeenCalledTimes(2);
    fireEvent.click(take);
    expect(screen.getByText('Approve in Ring')).toBeVisible();
    expect(approve).not.toHaveBeenCalled();
  });

  it('pauses in the background and serializes the foreground, timer and manual checks', async () => {
    const readInFlight = Promise.withResolvers<State>();
    const read = vi.fn(() => readInFlight.promise);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { unmount } = renderWaiting(read);
    await advance(60_000);
    expect(read).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.click(screen.getByRole('button', { name: 'Checking…' }));
    await advance(30_000);
    expect(read).toHaveBeenCalledTimes(1);
    await act(() => readInFlight.resolve('other-device'));
    unmount();
    await advance(60_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('retries a failed read and lets the user check again immediately', async () => {
    const read = vi.fn<() => Promise<State>>().mockRejectedValueOnce(new Error()).mockResolvedValue('handoff-ready');
    renderWaiting(read);
    await advance(5000);
    expect(screen.getByText('Could not check your homeserver. Trying again…')).toBeVisible();
    await advance(9999);
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check for transfer' })));
    expect(screen.getByRole('button', { name: 'Use wallet on this device' })).toBeEnabled();
    expect(screen.queryByText('Still waiting for your other device.')).toBeNull();
  });

  it('rechecks automatically after a network failure and discards a late reply after leaving', async () => {
    const readInFlight = Promise.withResolvers<State>();
    const read = vi
      .fn<(signal: AbortSignal) => Promise<State>>()
      .mockRejectedValueOnce(new Error())
      .mockReturnValue(readInFlight.promise);
    const { unmount } = renderWaiting(read);
    await advance(15_000);
    expect(read).toHaveBeenCalledTimes(2);
    const signal = read.mock.calls[1][0];
    unmount();
    expect(signal.aborted).toBe(true);
    await act(() => readInFlight.resolve('handoff-ready'));
    await advance(60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
