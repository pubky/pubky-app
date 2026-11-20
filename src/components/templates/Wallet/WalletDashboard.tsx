'use client';

import { useState } from 'react';
import type { Activity, Network, ReceiveRequest } from '@beignet/wallet-core';
import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Bitcoin,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { bitcoinAmount, lightningAmount, walletMessage } from '@/libs/wallet/amount';
import type { WalletSession } from '@/services/wallet/session';
import { useReceiveTracker } from './useReceiveTracker';
import { RecoveryWords, WalletPanel, type WalletTask } from './WalletPanel';
import { WalletReceive, WalletSend } from './WalletPayments';
import { WalletBalance } from './WalletReceipt';

type View = 'overview' | 'send' | 'receive' | 'backup';

export function WalletDashboard({
  session,
  walletId,
  ringBacked,
  network,
  recipient,
  lock,
  task,
}: {
  session: WalletSession;
  walletId: string;
  ringBacked: boolean;
  network: Network;
  recipient?: string;
  lock: () => void;
  task: WalletTask;
}) {
  const [view, setView] = useState<View>(recipient ? 'send' : 'overview');
  const [phrase, setPhrase] = useState('');
  // Discard wallet balances, invoice details and request status with the unlocked screen.
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const [request, setRequest] = useState<ReceiveRequest | null>(null);
  const tracking = useReceiveTracker(session.client, queries, walletId, request);
  const snapshot = useQuery(
    {
      queryKey: ['wallet', walletId],
      queryFn: () => session.client.snapshot(),
      refetchInterval: 15_000,
    },
    queries,
  );
  const data = snapshot.data;
  const unavailable = data
    ? Math.max(0, data.balance.totalSats - data.balance.availableSats - data.balance.pendingSats)
    : 0;
  const notes = new Set(data?.notes ?? []);
  const needsRecovery = data?.balance.pending?.erroredSats ?? 0;
  if (needsRecovery > 0) notes.add(`${bitcoinAmount(needsRecovery)} need recovery attention before they can be spent.`);
  const refresh = () => {
    void snapshot.refetch();
  };
  const switchTo = (next: View) => {
    setPhrase('');
    task.clearError();
    setView(next);
  };
  return (
    <>
      <Card className="gap-6 rounded-2xl border border-border p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Bitcoin className="size-5 text-brand" />
            Bitcoin <span className="rounded-full border border-border px-2 py-0.5 text-xs">{network}</span>
          </span>
          <Button variant="outline" size="sm" disabled={task.busy} onClick={lock}>
            <LockKeyhole /> Lock
          </Button>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total balance</p>
          {data ? (
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-6xl">
              <WalletBalance amount={data.balance.totalSats} />
            </p>
          ) : snapshot.isPending ? (
            <Spinner size="sm" aria-label="Loading balance" />
          ) : (
            <p>Balance unavailable</p>
          )}
          {data && (data.balance.availableSats !== data.balance.totalSats || data.balance.pendingSats > 0) && (
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Available to send</dt>
                <dd className="font-semibold tabular-nums">{bitcoinAmount(data.balance.availableSats)}</dd>
              </div>
              {data.balance.pendingSats > 0 && (
                <div>
                  <dt className="text-muted-foreground">Pending</dt>
                  <dd className="font-semibold tabular-nums">{bitcoinAmount(data.balance.pendingSats)}</dd>
                </div>
              )}
              {unavailable > 0 && (
                <div>
                  <dt className="text-muted-foreground">Unavailable in channels</dt>
                  <dd className="font-semibold tabular-nums">{bitcoinAmount(unavailable)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={view === 'send' ? 'brand' : 'default'} disabled={task.busy} onClick={() => switchTo('send')}>
            <ArrowUpRight /> Send
          </Button>
          <Button
            variant={view === 'receive' ? 'brand' : 'default'}
            disabled={task.busy}
            onClick={() => switchTo('receive')}
          >
            <ArrowDownLeft /> Receive
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={task.busy || snapshot.isFetching}
            aria-label="Refresh wallet"
            onClick={refresh}
          >
            <RefreshCw />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Back up wallet"
            disabled={task.busy}
            onClick={() => switchTo('backup')}
          >
            <KeyRound />
          </Button>
        </div>
        {notes.size > 0 && (
          <ul className="grid gap-1 rounded-xl bg-background p-3 text-sm text-muted-foreground">
            {Array.from(notes, (note) => (
              <li key={note}>
                {note === 'Wallet setup is not finished. Check Settings.'
                  ? 'Lightning setup is incomplete.'
                  : walletMessage(note)}
              </li>
            ))}
          </ul>
        )}
        {snapshot.isError && (
          <p role="status" className="text-sm text-muted-foreground">
            Could not refresh the wallet. {data ? 'Showing the last balance.' : 'Try refreshing.'}
          </p>
        )}
        {data && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <Zap className="size-4" /> {data.primary.connected ? 'Lightning connected' : 'Lightning disconnected'}
            {(!data.primary.connected || data.primary.setup !== 'ready') && (
              <Button
                size="sm"
                variant="outline"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await session.client.retrySetup();
                    refresh();
                  })
                }
              >
                Reconnect
              </Button>
            )}
            {data.primary.setupError && <p className="basis-full">{walletMessage(data.primary.setupError)}</p>}
          </div>
        )}
      </Card>
      {view === 'send' && (
        <WalletSend client={session.client} network={network} recipient={recipient} task={task} refresh={refresh} />
      )}
      {view === 'receive' && (
        <WalletReceive
          client={session.client}
          task={task}
          request={request}
          setRequest={setRequest}
          receipt={tracking.receipt}
          unavailable={tracking.unavailable}
          refresh={refresh}
          newBitcoinAddress={() => session.newBitcoinAddress(network)}
        />
      )}
      {view === 'backup' && ringBacked && (
        <WalletPanel title="Pubky Ring recovery" icon={KeyRound}>
          <p className="text-sm text-muted-foreground">
            Back up your Pubky identity in Ring. To recover on another device, close this wallet, sign in with the same
            Pubky and choose Recover with Ring. Lightning recovery also needs current channel data from the recovery peer.
          </p>
        </WalletPanel>
      )}
      {view === 'backup' && !ringBacked && (
        <WalletPanel title="Recovery phrase" icon={KeyRound}>
          {phrase ? (
            <RecoveryWords phrase={phrase} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Make sure your screen is private before revealing the words.
            </p>
          )}
          <Button
            variant="outline"
            className="self-start"
            disabled={task.busy}
            onClick={() =>
              phrase ? switchTo('overview') : task.run(async () => setPhrase(await session.client.getRecoveryPhrase()))
            }
          >
            {phrase ? 'Hide recovery phrase' : 'Reveal recovery phrase'}
          </Button>
        </WalletPanel>
      )}
      <WalletPanel title="Activity" icon={ActivityIcon}>
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {snapshot.isPending ? 'Loading activity…' : 'Activity unavailable.'}
          </p>
        ) : data.activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your payments and requests will appear here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.activity.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </WalletPanel>
    </>
  );
}

function ActivityRow({ row }: { row: Activity }) {
  const Icon = row.kind === 'sent' ? ArrowUpRight : row.kind === 'received' ? ArrowDownLeft : ActivityIcon;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="rounded-full bg-secondary p-2">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{row.title}</p>
        <p className="text-xs text-muted-foreground">{new Date(row.timestamp).toLocaleString()}</p>
        {row.feeKnown && row.kind === 'sent' && (
          <p className="text-xs text-muted-foreground">
            {row.feeEstimated ? 'Estimated fee' : 'Fee'}{' '}
            {row.payAll ? lightningAmount(row.payAll.feeMsat) : bitcoinAmount(row.feeSats)}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {row.kind === 'sent' ? '−' : row.kind === 'received' ? '+' : ''}
          {row.payAll && row.status === 'completed'
            ? lightningAmount(row.payAll.deliveredMsat)
            : bitcoinAmount(row.amountSats)}
        </p>
        <p className="text-xs text-muted-foreground capitalize">{row.status}</p>
      </div>
    </li>
  );
}
