'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Activity, Network, ReceiveRequest, WalletSnapshot } from '@beignet/wallet-core';
import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Bitcoin,
  Check,
  ChevronRight,
  Clock3,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Dialog, DialogContent, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { bitcoinAmount, lightningAmount, walletMessage } from '@/libs/wallet/amount';
import type { LastWalletBalance, WalletSession } from '@/services/wallet/session';
import { useReceiveTracker } from './useReceiveTracker';
import { SavedBalance } from './WalletOpening';
import { RecoveryWords, WalletPanel, type WalletTask } from './WalletPanel';
import { WalletReceive, WalletSend } from './WalletPayments';
import { ActivityReceipt, activityReceiptAmount, activityReceiptTitle, WalletBalance } from './WalletReceipt';

type ActivityEntry = { key: string; row: Activity };

// Submissions acquire an engine ID when reconciled. A payment hash alone cannot
// identify an attempt: two failed or retried submissions can share the same invoice.
function keepActivityOrder(rows: Activity[], previous: ActivityEntry[] = []) {
  if (!previous.length) return rows.map((row) => ({ key: row.id, row }));
  const currentIds = new Set(rows.map((row) => row.id));
  const byId = new Map(previous.map((entry) => [entry.row.id, entry]));
  const byReference = new Map<string, ActivityEntry | null>();
  for (const entry of previous) {
    if (currentIds.has(entry.row.id)) continue;
    const ref = entry.row.reference;
    if (ref) byReference.set(ref, byReference.has(ref) ? null : entry);
  }
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const row of rows) {
    if (byId.has(row.id)) continue;
    if (seen.has(row.reference)) repeated.add(row.reference);
    seen.add(row.reference);
  }
  const entries = rows.map((row) => {
    let match = byId.get(row.id);
    if (!match && !repeated.has(row.reference) && !row.id.startsWith('submission:')) {
      const old = byReference.get(row.reference);
      if (old?.row.id.startsWith('submission:') && old.row.status !== 'failed') match = old;
    }
    const key = match && (match.key === row.id || !currentIds.has(match.key)) ? match.key : row.id;
    return { key, row };
  });
  // Fill retained slots in display order. New and backfilled rows take the engine's positions.
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const retained = previous.flatMap(({ key }) => byKey.get(key) ?? []);
  const retainedKeys = new Set(retained.map(({ key }) => key));
  let index = 0;
  return entries.map((entry) => (retainedKeys.has(entry.key) ? retained[index++] : entry));
}

// Wallet-core exposes sanitized setup diagnostics. Network interruptions and its
// nonspecific connection failure can clear on the engine's first automatic retry.
function canRetryPrimary(error?: string) {
  return (
    !error ||
    /timed out|unreachable|refused the connection|address could not be resolved|^Primary setup could not complete\./i.test(
      error,
    )
  );
}

type View = 'overview' | 'send' | 'receive' | 'backup';

export function WalletDashboard({
  session,
  connection,
  connectionNotice,
  walletId,
  ringBacked,
  interrupted,
  onPaymentReviewed,
  lastBalance,
  network,
  recipient,
  lock,
  task,
}: {
  session: WalletSession;
  connection: 'syncing' | 'ready' | 'failed';
  connectionNotice: ReactNode;
  walletId: string;
  ringBacked: boolean;
  interrupted: 'legacy' | 'payment' | null;
  onPaymentReviewed: () => void;
  lastBalance: LastWalletBalance | null;
  network: Network;
  recipient?: string;
  lock: () => void;
  task: WalletTask;
}) {
  const ready = connection === 'ready';
  const [view, setView] = useState<View>(recipient ? 'send' : 'overview');
  const lastAction = useRef<'send' | 'receive' | null>(null);
  const sendButton = useRef<HTMLButtonElement>(null);
  const receiveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (view !== 'overview' || !lastAction.current) return;
    const button = lastAction.current === 'send' ? sendButton : receiveButton;
    button.current?.focus({ preventScroll: true });
    button.current?.scrollIntoView?.({ block: 'nearest' });
    lastAction.current = null;
  }, [view]);
  const [phrase, setPhrase] = useState('');
  // Discard wallet balances, invoice details and request status with the unlocked screen.
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const [request, setRequest] = useState<ReceiveRequest | null>(null);
  const tracking = useReceiveTracker(session.client, queries, walletId, request);
  const savedActivity = useQuery(
    {
      queryKey: ['saved-activity', walletId],
      queryFn: () => session.savedActivity(walletId),
      enabled: !ready,
      staleTime: Infinity,
    },
    queries,
  );
  const draftKey = ['offline-receive-draft', walletId];
  const draft = useQuery(
    {
      queryKey: draftKey,
      queryFn: () => session.loadOfflineReceiveDraft(),
      enabled: ready && view === 'receive',
      staleTime: Infinity,
    },
    queries,
  );
  const lastReturn = useRef(0);
  useEffect(() => {
    const onReturn = () => {
      if (!document.hidden) lastReturn.current = Date.now();
    };
    if (ready) onReturn();
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, [ready]);
  const snapshot = useQuery(
    {
      queryKey: ['wallet', walletId],
      enabled: ready,
      queryFn: async ({ queryKey }) => {
        const live = await session.client.snapshot();
        const previous = queries.getQueryData<{
          entries: ActivityEntry[];
          away: string[];
          settledAt: number;
          firstReadAt: number;
          connectedOnce: boolean;
        }>(queryKey);
        const [activityChecked, away] = await Promise.all([
          interrupted ? session.activityIncludesChannelSends(live.activity).catch(() => false) : false,
          live.wallet?.id === walletId && live.wallet.network === network
            ? session.awayReceipts(walletId, live.activity, live.primary.connected).catch(() => previous?.away ?? [])
            : [],
        ]);
        const newReceipt = away.some((hash) => !previous?.away.includes(hash));
        const settledAt = newReceipt ? Date.now() : (previous?.settledAt ?? 0);
        return {
          ...live,
          firstReadAt: previous?.firstReadAt ?? Date.now(),
          connectedOnce:
            previous?.connectedOnce ||
            (live.primary.connected &&
              (!live.primary.setup || live.primary.setup === 'ready') &&
              !live.primary.setupError),
          entries: keepActivityOrder(live.activity, previous?.entries),
          activityChecked,
          away,
          settledAt,
        };
      },
      refetchInterval: ({ state: { data } }) => {
        const now = Date.now();
        // A connected peer may still be delivering a settlement, and the channel
        // balance can follow the receipt. Briefly check both on return.
        if (data && now - data.settledAt < 5_000) return 2_000;
        if (data && now - lastReturn.current < 60_000) {
          const waiting = data.activity.some(
            (row) => row.kind === 'request' && row.status === 'pending' && row.receiveRequest?.offlineReceive,
          );
          if (waiting || (data.balance.unresolvedOfflineSlots ?? 0) > 0) return 2_000;
        }
        return data?.activity.some((row) => row.kind === 'sent' && row.status === 'pending') ? 4_000 : 15_000;
      },
    },
    queries,
  );
  useEffect(() => {
    if (!ready) return;
    const queryKey = ['wallet', walletId];
    let active = true;
    let queued = false;
    const refreshPrimary = async () => {
      if (!active || queued) return;
      queued = true;
      // A hint can arrive while the first snapshot is still reading the old
      // peer state. Finish that read, then ask the engine for fresh evidence.
      if (queries.isFetching({ queryKey })) await queries.refetchQueries({ queryKey }, { cancelRefetch: false });
      queued = false;
      if (active) await queries.refetchQueries({ queryKey }, { cancelRefetch: false });
    };
    const unsubscribe = session.onPrimaryChange(() => void refreshPrimary());
    // Catch a missed peer event or the offline capability probe completing
    // after connect. The local wallet record does not scan Bitcoin or reconcile history.
    const deadline = Date.now() + 60_000;
    let checking = false;
    const timer = window.setInterval(async () => {
      if (Date.now() >= deadline) window.clearInterval(timer);
      if (!active || checking || document.hidden || queries.isFetching({ queryKey })) return;
      const live = queries.getQueryData<WalletSnapshot>(queryKey);
      if (!live) return;
      const peer = live.primary;
      const receivePeer = live.primaries?.find((entry) => entry.isReceiveTarget) ?? peer;
      if (
        peer.connected &&
        peer.setup !== 'pending' &&
        peer.setup !== 'failed' &&
        !peer.setupError &&
        receivePeer.offlineReceiveAvailable !== null
      )
        return;
      checking = true;
      try {
        const records = await session.client.listWallets();
        const record = records.find((entry) => entry.id === walletId && entry.network === network)?.lfbw;
        const connected = record?.primaries?.[0]?.connected;
        if (
          record &&
          (record.setup !== peer.setup ||
            record.setupError !== peer.setupError ||
            (typeof connected === 'boolean' && connected !== peer.connected) ||
            (typeof record.offlineReceiveAvailable === 'boolean' &&
              record.offlineReceiveAvailable !== receivePeer.offlineReceiveAvailable))
        ) {
          await refreshPrimary();
        }
      } catch {
        // The normal snapshot cadence still covers older engines and read failures.
      } finally {
        checking = false;
      }
    }, 1500);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [network, queries, ready, session, walletId]);
  const data = snapshot.data;
  const entries = data?.entries ?? savedActivity.data?.map((row) => ({ key: row.id, row }));
  const receivePrimary = data?.primaries?.find((primary) => primary.isReceiveTarget) ?? data?.primary;
  const away = new Set(data?.away);
  const verifiedTotal =
    data?.wallet?.id === walletId && data.wallet.network === network ? data.balance.totalSats : undefined;
  const needsPaymentReview =
    interrupted === 'payment' ||
    (interrupted === 'legacy' &&
      verifiedTotal !== undefined &&
      data?.activity.some((row) => row.kind === 'sent' && (row.status === 'pending' || row.status === 'uncertain')));
  const canAcknowledge =
    verifiedTotal !== undefined && data?.activityChecked && snapshot.isSuccess && !snapshot.isFetching;
  useEffect(() => {
    if (interrupted === 'legacy' && canAcknowledge && !needsPaymentReview) {
      void session
        .acknowledgePayment('legacy')
        .then(onPaymentReviewed)
        .catch(() => {});
    }
  }, [interrupted, canAcknowledge, needsPaymentReview, session, onPaymentReviewed]);
  useEffect(() => {
    if (verifiedTotal !== undefined)
      void session.rememberBalance(walletId, network, verifiedTotal).catch(() => undefined);
  }, [session, walletId, network, verifiedTotal]);
  const unavailable = data
    ? Math.max(0, data.balance.totalSats - data.balance.availableSats - data.balance.pendingSats)
    : 0;
  const notes = new Set(
    data?.notes?.filter(
      (note) =>
        !note.endsWith(
          ' sats are in a transfer that has not confirmed yet. You can send now. Bitcoin address payments complete after confirmation.',
        ),
    ),
  );
  // The engine includes the generic setup note even during an ordinary peer handshake.
  notes.delete('Wallet setup is not finished. Check Settings.');
  const primary = data?.primary;
  const setupError = primary?.setup !== 'pending' ? primary?.setupError : undefined;
  const setupFailed = primary?.setup === 'failed' || !!setupError;
  const firstReadAt = data?.firstReadAt;
  const warmingPrimary =
    !!data &&
    !data.connectedOnce &&
    (!primary?.connected || primary.setup === 'pending' || setupFailed) &&
    (!setupFailed || canRetryPrimary(setupError));
  const [startupWaitElapsed, setStartupWaitElapsed] = useState(false);
  useEffect(() => {
    if (!warmingPrimary || !firstReadAt || startupWaitElapsed) return;
    // Give the engine's first automatic retry (5s plus its dial timeout) time
    // to finish. Persistent failures keep their diagnostic and reconnect action.
    const timeout = window.setTimeout(
      () => setStartupWaitElapsed(true),
      Math.max(0, firstReadAt + 20_000 - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [firstReadAt, warmingPrimary, startupWaitElapsed]);
  const slowConnection = warmingPrimary && startupWaitElapsed && !setupFailed;
  const needsRecovery = data?.balance.pending?.erroredSats ?? 0;
  if (needsRecovery > 0) notes.add(`${bitcoinAmount(needsRecovery)} need recovery attention before they can be spent.`);
  const refresh = () => {
    if (ready) void snapshot.refetch();
  };
  const switchTo = (next: View) => {
    if (next === 'overview' && (view === 'send' || view === 'receive')) lastAction.current = view;
    setPhrase('');
    task.clearError();
    setView(next);
  };
  const notices = (
    <>
      {connectionNotice}
      {notes.size > 0 && (
        <ul className="grid gap-1 rounded-xl bg-background p-3 text-sm text-muted-foreground">
          {Array.from(notes, (note) => (
            <li key={note}>{walletMessage(note)}</li>
          ))}
        </ul>
      )}
      {snapshot.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          Could not refresh the wallet. {data ? 'Showing the last balance.' : 'Try refreshing.'}
        </p>
      )}
      {warmingPrimary && !startupWaitElapsed ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" aria-hidden className="motion-reduce:animate-none" /> Connecting to Lightning…
        </p>
      ) : primary && (setupFailed || !primary.connected || slowConnection) ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <Zap className="size-4" />{' '}
          {setupFailed
            ? 'Lightning connection failed'
            : slowConnection
              ? 'Still connecting to Lightning…'
              : 'Lightning disconnected'}
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
          {setupError && <p className="basis-full">{walletMessage(setupError)}</p>}
        </div>
      ) : null}
    </>
  );
  const navigation = {
    back: () => switchTo('overview'),
    lock,
    busy: task.busy,
    balance: data && (
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
        {view === 'send' ? 'Available to send' : 'Total balance'}
        <span className="font-medium text-foreground tabular-nums">
          {view === 'send' ? (
            bitcoinAmount(data.balance.availableSats)
          ) : (
            <WalletBalance amount={data.balance.totalSats} />
          )}
        </span>
        <span className="border-l border-border pl-1.5">{network}</span>
      </p>
    ),
    notices: (
      <>
        {notices}
        {view === 'send' && needsPaymentReview && (
          <Button
            type="button"
            disabled={task.busy}
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => switchTo('overview')}
          >
            Check previous payment in Activity
          </Button>
        )}
      </>
    ),
  };
  if (view === 'send')
    return (
      <WalletSend
        ready={ready}
        client={session.client}
        navigation={navigation}
        activity={data?.activity}
        sendPayment={(review) => session.send(review)}
        network={network}
        recipient={recipient}
        task={task}
        refresh={refresh}
      />
    );
  if (view === 'receive')
    return (
      <WalletReceive
        ready={ready}
        client={session.client}
        navigation={navigation}
        task={task}
        request={request}
        setRequest={setRequest}
        receipt={tracking.receipt}
        receivedWhileAway={!!request?.paymentHash && away.has(request.paymentHash)}
        unavailable={tracking.unavailable}
        offlineCapacity={data?.balance.offlineReceivableSats}
        primaryOfflineAvailable={receivePrimary?.offlineReceiveAvailable}
        primaryConnected={receivePrimary?.connected}
        offlineDraft={draft.data}
        offlineDraftReady={draft.isSuccess}
        reloadOfflineDraft={
          draft.isError
            ? async () => {
                await draft.refetch({ throwOnError: true });
              }
            : undefined
        }
        discardOfflineDraft={async (id) => {
          await session.discardOfflineReceiveDraft(id);
          await draft.refetch({ throwOnError: true });
        }}
        issueOffline={async (quote) => {
          try {
            const issued = await session.receive(quote);
            queries.setQueryData(draftKey, null);
            return issued;
          } catch (error) {
            await draft.refetch();
            throw error;
          }
        }}
        refresh={refresh}
        newBitcoinAddress={() => session.newBitcoinAddress(network)}
      />
    );
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
          {(data || !lastBalance) && <p className="text-sm text-muted-foreground">Total balance</p>}
          {data ? (
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-6xl">
              <WalletBalance amount={data.balance.totalSats} />
            </p>
          ) : lastBalance ? (
            <SavedBalance balance={lastBalance} />
          ) : !ready ? (
            <div aria-label="Balance pending" className="mt-2 h-9 w-36 rounded bg-secondary" />
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
          <Button ref={sendButton} variant="default" disabled={task.busy} onClick={() => switchTo('send')}>
            <ArrowUpRight /> Send
          </Button>
          <Button ref={receiveButton} variant="default" disabled={task.busy} onClick={() => switchTo('receive')}>
            <ArrowDownLeft /> Receive
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={!ready || task.busy || snapshot.isFetching}
            aria-label="Refresh wallet"
            onClick={refresh}
          >
            <RefreshCw />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Back up wallet"
            disabled={task.busy || (connection === 'syncing' && !ringBacked)}
            onClick={() => switchTo('backup')}
          >
            <KeyRound />
          </Button>
        </div>
        {notices}
      </Card>
      {view === 'backup' && ringBacked && (
        <WalletPanel title="Pubky Ring recovery" icon={KeyRound}>
          <p className="text-sm text-muted-foreground">
            Back up your Pubky identity in Ring. To recover on another device, close this wallet, sign in with the same
            Pubky and choose Recover with Ring. Lightning recovery also needs current channel data from the recovery
            peer.
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
            disabled={task.busy || connection === 'syncing'}
            onClick={() =>
              phrase ? switchTo('overview') : task.run(async () => setPhrase(await session.client.getRecoveryPhrase()))
            }
          >
            {phrase ? 'Hide recovery phrase' : 'Reveal recovery phrase'}
          </Button>
        </WalletPanel>
      )}
      <WalletPanel title={!data && entries?.length ? 'Saved activity' : 'Activity'} icon={ActivityIcon}>
        {needsPaymentReview && (
          <div role="status" className="grid gap-2 rounded-xl border border-border p-3 text-sm">
            <p>
              Check the previous payment before sending it again. If its outcome is unclear, confirm with the recipient.
            </p>
            {canAcknowledge && interrupted && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await session.acknowledgePayment(interrupted);
                    onPaymentReviewed();
                  })
                }
              >
                I checked Activity
              </Button>
            )}
            {snapshot.isSuccess && !snapshot.isFetching && !data?.activityChecked && (
              <p>Refresh the wallet to check all payment records.</p>
            )}
          </div>
        )}
        {!entries || (!data && entries.length === 0) ? (
          <p className="text-sm text-muted-foreground">
            {ready
              ? snapshot.isPending
                ? 'Loading activity…'
                : 'Activity unavailable.'
              : 'Activity will update after sync.'}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your payments and requests will appear here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map(({ key, row }) => (
              <ActivityRow
                key={key}
                row={row}
                checkedAt={snapshot.dataUpdatedAt}
                showInvoice={(invoice) => {
                  setRequest(invoice);
                  switchTo('receive');
                }}
                receivedWhileAway={
                  row.kind === 'received' &&
                  row.status === 'completed' &&
                  !!row.paymentHash &&
                  away.has(row.paymentHash)
                }
              />
            ))}
          </ul>
        )}
      </WalletPanel>
    </>
  );
}

function ActivityRow({
  row,
  checkedAt,
  receivedWhileAway,
  showInvoice,
}: {
  row: Activity;
  checkedAt: number;
  receivedWhileAway: boolean;
  showInvoice: (invoice: ReceiveRequest) => void;
}) {
  const reduced = useReducedMotion();
  const invoice = row.receiveRequest;
  const canShowInvoice =
    invoice?.offlineReceive &&
    !invoice.demo &&
    invoice.paymentHash === row.paymentHash &&
    row.kind === 'request' &&
    row.status === 'pending' &&
    row.receiveStatus?.phase === 'waiting' &&
    !row.receiveStatusUnavailable &&
    invoice.expiresAt > checkedAt;
  const completed = row.status === 'completed';
  const title =
    !completed && (row.title === 'Payment sent' || row.title === 'Payment received')
      ? activityReceiptTitle(row)
      : row.title;
  const Icon = completed
    ? Check
    : row.status === 'pending'
      ? Clock3
      : row.kind === 'sent'
        ? ArrowUpRight
        : ActivityIcon;
  return (
    <li>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-2 rounded-xl px-1 py-3 text-left whitespace-normal sm:gap-3 sm:px-2"
          >
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-secondary">
              <AnimatePresence initial={false}>
                <motion.span
                  key={completed ? 'completed' : 'open'}
                  initial={reduced ? false : { scale: 0.85, opacity: 0.4 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.22 }}
                  className={completed ? 'text-brand' : 'text-muted-foreground'}
                >
                  <Icon className="size-4" />
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate font-semibold">{title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {new Date(row.timestamp).toLocaleString()}
              </span>
              {receivedWhileAway && (
                <span className="text-xs font-normal text-muted-foreground">Received while you were away</span>
              )}
              {row.feeKnown && row.kind === 'sent' && (
                <span className="text-xs font-normal text-muted-foreground">
                  {row.feeEstimated ? 'Estimated fee' : 'Fee'}{' '}
                  {row.payAll ? lightningAmount(row.payAll.feeMsat) : bitcoinAmount(row.feeSats)}
                </span>
              )}
            </span>
            <span className="grid gap-0.5 text-right">
              <span className="text-sm font-semibold tabular-nums">
                {row.kind === 'sent' ? '−' : row.kind === 'received' ? '+' : ''}
                {activityReceiptAmount(row)}
              </span>
              <span className="text-xs font-normal text-muted-foreground capitalize">{row.status}</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </Button>
        </DialogTrigger>
        <DialogContent
          hiddenTitle="Payment receipt"
          data-sentry-block
          className="sentry-block w-full motion-reduce:duration-0 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none sm:max-w-md"
        >
          <ActivityReceipt row={row} receivedWhileAway={receivedWhileAway} />
          {canShowInvoice && (
            <Button variant="outline" onClick={() => showInvoice(invoice)}>
              Show invoice
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </li>
  );
}
