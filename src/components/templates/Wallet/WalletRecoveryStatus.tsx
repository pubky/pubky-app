'use client';

import { type ReactNode, useState } from 'react';
import type { WalletRecoveryStatus } from '@beignet/wallet-core';
import { QueryClient, useQuery } from '@tanstack/react-query';
import type { ChannelBalanceHold, WalletSession } from '@/services/wallet/session';

type RecoveryState =
  | 'ready'
  | 'checking'
  | 'waiting'
  | 'verifying'
  | 'fenced'
  | 'restart'
  | 'refused'
  | 'unavailable'
  | 'funding-check'
  | 'peer-recovery'
  | ChannelBalanceHold;

function recoveryState(status: WalletRecoveryStatus, recovering: boolean): RecoveryState {
  if (status.state === 'fenced') return 'fenced';
  if (status.state === 'restart-required') return 'restart';
  if (status.state === 'restoring' || status.autoApply.phase === 'applying') return 'verifying';
  if (status.importPending || status.state === 'restore-required') {
    if (status.autoApply.phase === 'refused') return 'refused';
    return status.autoApply.phase === 'settling' || status.capsuleCount > 0 ? 'verifying' : 'waiting';
  }
  if (recovering && status.state === 'disabled') return 'unavailable';
  // Force-closing channels are already represented in the balance awaiting on-chain settlement.
  const channels = status.channels.filter((row) => row.status !== 'force_closing');
  if (channels.some((row) => row.restoreRecencyUnproven || row.status === 'restore_recency_unproven')) {
    return 'imported-held';
  }
  if (
    channels.some((row) =>
      ['state_uncertain', 'local_data_loss', 'reestablish_recency_unproven', 'reestablish_secret_missing'].includes(
        row.status,
      ),
    )
  ) {
    return 'peer-recovery';
  }
  if (channels.some((row) => row.fundingUnidentified)) return 'funding-check';
  // In peer-storage mode the engine also reports an ordinary reconnect handshake as quarantined.
  if (status.mode !== 'peer-storage' && channels.some((row) => row.status === 'quarantined')) return 'held';
  return 'ready';
}

export function useWalletRecovery(
  session: { client: Pick<WalletSession['client'], 'getRecoveryStatus'> },
  queries: QueryClient,
  walletId: string,
  ready: boolean,
  recovering = false,
) {
  const query = useQuery(
    {
      queryKey: ['wallet-recovery', walletId, recovering],
      enabled: ready,
      queryFn: async () => {
        const status = await session.client.getRecoveryStatus();
        // Keep channel identifiers and engine diagnostics out of the UI cache.
        return { state: recoveryState(status, recovering), imported: status.importComplete };
      },
      refetchInterval: ({ state: { data } }) => {
        if (data?.state === 'fenced' || data?.state === 'restart') return false;
        return data?.state === 'waiting' || data?.state === 'verifying' ? 3_000 : 15_000;
      },
    },
    queries,
  );
  const state =
    query.isError && (!query.data || query.data.state === 'ready')
      ? 'unavailable'
      : (query.data?.state ?? (recovering ? 'checking' : 'ready'));
  const heldChannels =
    state === 'held' || state === 'imported-held' || state === 'funding-check' || state === 'peer-recovery';
  return {
    state,
    heldChannels,
    blocked: state !== 'ready' && !heldChannels,
    checked: query.isSuccess,
    imported: query.data?.imported === true,
    refresh: query.refetch,
    refreshing: query.isFetching,
  };
}

export function WalletRecoveryNotice({ state, restored = false }: { state: RecoveryState; restored?: boolean }) {
  if (state === 'ready' && !restored) return null;
  let title: string;
  let detail: string;
  switch (state) {
    case 'checking':
      title = 'Checking wallet recovery';
      detail = 'Your balance will appear once the wallet checks its backup.';
      break;
    case 'waiting':
      title = 'Waiting for your Lightning backup';
      detail = 'Keep this wallet open and online so your Lightning peer can send its backup. Payments are paused.';
      break;
    case 'verifying':
      title = 'Checking your Lightning backup';
      detail = 'Keep this wallet open while it restores your channel balances. Payments are paused.';
      break;
    case 'fenced':
      title = 'Another device controls this wallet';
      detail = 'Lock this copy and continue on the device where you most recently recovered the wallet.';
      break;
    case 'restart':
      title = 'Reopen your wallet to finish recovery';
      detail = 'Your backup has been installed. Lock this wallet, then unlock it again on this device.';
      break;
    case 'refused':
      title = 'Your Lightning backup could not be verified';
      detail =
        'Keep your previous device’s wallet data. Payments are paused. Lock and reopen this wallet to try again.';
      break;
    case 'unavailable':
      title = 'Wallet recovery status is unavailable';
      detail = 'Keep this wallet open and online. It will check again automatically.';
      break;
    case 'imported-held':
      title = 'Restored Lightning funds are on hold';
      detail =
        'The backup could be missing newer payments. Ask your Lightning peer to close the affected channel from its latest state. Keep this wallet’s site data so it can track the settlement.';
      break;
    case 'funding-missing':
      title = 'Waiting for channel funding';
      detail =
        'The wallet can’t find this channel’s funding transaction on Bitcoin or in the mempool. It checks again automatically. The affected balance is unavailable for payments.';
      break;
    case 'funding-check':
      title = 'Checking the channel funding';
      detail =
        'The wallet is watching a possible funding output on Bitcoin. It can identify this channel’s funds once the output is spent. Keep this browser’s wallet data.';
      break;
    case 'peer-recovery':
      title = 'Channel recovery needs your Lightning peer';
      detail =
        'Keep this wallet online so the peer can provide missing updates or settle the channel on Bitcoin. The affected balance is unavailable for payments.';
      break;
    case 'held':
      title = 'Some Lightning funds are on hold';
      detail =
        'The wallet could not verify the affected channel. Keep this browser’s wallet data. It will check again automatically.';
      break;
    case 'ready':
      title = 'Lightning backup restored';
      detail = 'Your wallet has finished checking its channels.';
      break;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="grid gap-1 rounded-xl border border-border p-3 text-sm"
    >
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground">{detail}</p>
    </div>
  );
}

export function WalletCheckoutRecovery({
  session,
  walletId,
  recovering,
  children,
}: {
  session: WalletSession;
  walletId: string;
  recovering: boolean;
  children: ReactNode;
}) {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const recovery = useWalletRecovery(session, queries, walletId, true, recovering);
  return (
    <>
      <WalletRecoveryNotice state={recovery.state} />
      {recovery.checked && !recovery.blocked && children}
    </>
  );
}
