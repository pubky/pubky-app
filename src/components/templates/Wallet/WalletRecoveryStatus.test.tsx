import { useState } from 'react';
import type { WalletRecoveryStatus } from '@beignet/wallet-core';
import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useWalletRecovery, WalletRecoveryNotice } from './WalletRecoveryStatus';

const running: WalletRecoveryStatus = {
  mode: 'peer-storage',
  state: 'running',
  importPending: false,
  importComplete: false,
  autoApply: { enabled: true, phase: 'idle', lastReason: 'private diagnostic' },
  capsuleCount: 0,
  backupChannelCount: null,
  channels: [],
};
const channel = {
  channelId: 'a'.repeat(64),
  status: 'active',
  restoreRecencyUnproven: false,
  fundingUnidentified: false,
};

function Recovery({ read, recovering = true }: { read: () => Promise<WalletRecoveryStatus>; recovering?: boolean }) {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const recovery = useWalletRecovery({ client: { getRecoveryStatus: read } }, queries, 'wallet', true, recovering);
  return (
    <>
      <WalletRecoveryNotice state={recovery.state} restored={recovering && recovery.imported} />
      <button disabled={recovery.blocked}>Pay</button>
    </>
  );
}

it.each<[Partial<WalletRecoveryStatus>, string, boolean]>([
  [{ importPending: true }, 'Waiting for your Lightning backup', true],
  [{ importPending: true, capsuleCount: 1 }, 'Checking your Lightning backup', true],
  [{ state: 'restoring' }, 'Checking your Lightning backup', true],
  [{ state: 'restart-required' }, 'Reopen your wallet to finish recovery', true],
  [{ state: 'fenced', importPending: true }, 'Another device controls this wallet', true],
  [
    { importPending: true, autoApply: { ...running.autoApply, phase: 'refused' } },
    'Your Lightning backup could not be verified',
    true,
  ],
  [
    { importComplete: true, channels: [{ ...channel, restoreRecencyUnproven: true }] },
    'Restored Lightning funds are on hold',
    false,
  ],
  [{ channels: [{ ...channel, fundingUnidentified: true }, channel] }, 'Some Lightning funds are on hold', false],
  [{ importComplete: true }, 'Lightning backup restored', false],
])('renders the recovery state without exposing channel or diagnostic details', async (overrides, title, blocked) => {
  const read = vi.fn().mockResolvedValue({ ...running, ...overrides });
  render(<Recovery read={read} />);
  expect(await screen.findByText(title)).toBeVisible();
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Pay' })).toHaveProperty('disabled', blocked);
  expect(screen.queryByText(/private diagnostic|a{64}/)).toBeNull();
});

it('blocks a fresh restore while checking, even if the status request fails', async () => {
  const result = Promise.withResolvers<WalletRecoveryStatus>();
  render(<Recovery read={() => result.promise} />);
  expect(screen.getByText('Checking wallet recovery')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
  await act(async () => result.reject(new Error('private diagnostic')));
  expect(await screen.findByText('Wallet recovery status is unavailable')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
});

it('keeps ordinary unlock responsive while the local recovery check is in flight', async () => {
  const result = Promise.withResolvers<WalletRecoveryStatus>();
  render(<Recovery read={() => result.promise} recovering={false} />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('button', { name: 'Pay' })).toBeEnabled();
  await act(async () => result.resolve(running));
  expect(screen.queryByRole('status')).toBeNull();
});
