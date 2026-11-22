'use client';

import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { CreateWalletInput, Network, WalletRecord } from '@beignet/wallet-core';
import { ArrowRight, KeyRound, LockKeyhole, Wallet as WalletIcon } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { walletMessage } from '@/libs/wallet/amount';
import {
  acquireRingDevice,
  cancelRingHandoff,
  claimRingHandoff,
  inspectRingDevice,
  RingDeviceBusyError,
  type RingDeviceLease,
  type RingDeviceStatus,
  RingEnrollmentError,
} from '@/services/wallet/ring-enrollment';
import {
  type LastWalletBalance,
  type LocalRingUnlock,
  type LocalUnlockScope,
  type WalletDefaults,
  WalletSession,
  type WalletStartProgress,
} from '@/services/wallet/session';
import { WalletDashboard } from './WalletDashboard';
import { WalletDeviceSwitch } from './WalletDeviceSwitch';
import { WalletKeyApproval } from './WalletKeyApproval';
import { WalletOpening } from './WalletOpening';
import { RecoveryWords, useWalletTask, WalletPanel, type WalletTask } from './WalletPanel';
import { WalletCheckoutRecovery } from './WalletRecoveryStatus';
import { type RingSetupMode, WalletRingSetup } from './WalletRingSetup';

type ActiveWallet = { id: string; network: Network; session: WalletSession };
type RingBinding = NonNullable<Awaited<ReturnType<WalletSession['ringBinding']>>>;
type WaitingForDevice = { kind: 'waiting-for-device'; wallet: ActiveWallet; binding: RingBinding };
type TransferResult = 'offered' | 'moved-away' | 'received' | 'still-ready' | 'kept' | 'unpublished' | 'incomplete';
type Stage =
  | { kind: 'checking' | 'unavailable' | 'framed' }
  | { kind: 'opening' }
  | { kind: 'preparing-move' }
  | { kind: 'password'; exists: boolean; showPassword?: boolean }
  | {
      kind: 'local-approval';
      scope: LocalUnlockScope;
      operation: 'new' | 'unlock' | 'enroll';
      previous: 'new' | 'existing';
      active?: ActiveWallet;
    }
  | { kind: 'empty'; defaults: CreateWalletInput; network: Network }
  | { kind: 'ring'; defaults: CreateWalletInput; network: Network; session: WalletSession; reserved: boolean }
  | { kind: 'backup'; id: string; network: Network; phrase: string }
  | { kind: 'start'; id: string; network: Network; checking?: 'vault' | 'device' }
  | WaitingForDevice
  | {
      kind: 'switch';
      session: WalletSession;
      network: Network;
      deviceId: string;
      status: RingDeviceStatus | 'offer';
      sourceReceipt?: string;
    }
  | { kind: 'switch-result'; result: TransferResult }
  | ({ kind: 'wallet' } & ActiveWallet &
      (
        | { status: 'syncing'; progress?: WalletStartProgress }
        | { status: 'ready' }
        | { status: 'failed'; message: string }
      ));

export type UnlockedWallet = { session: WalletSession; network: Network; task: WalletTask };

async function closeDevice(session: WalletSession, held: RingDeviceLease | null) {
  try {
    await session.close();
  } catch (error) {
    // An uncertain engine shutdown must neither give away nor keep renewing the lease.
    await held?.abandon();
    throw error;
  }
  await held?.release();
}

function startMessage(progress?: WalletStartProgress) {
  if (!progress) return 'Connecting to Bitcoin and Lightning…';
  if (progress.phase === 'opening') return 'Opening your Bitcoin wallet…';
  if (progress.phase === 'scanning')
    return progress.primaryConnected ? 'Lightning connected. Syncing Bitcoin…' : 'Syncing Bitcoin…';
  return progress.primaryConnected ? 'Finishing wallet startup…' : 'Connecting to Lightning…';
}

export function WalletAccount({
  account,
  recipient,
  reset,
  renderReady,
}: {
  account: string;
  recipient?: string;
  reset: () => void;
  renderReady?: (wallet: UnlockedWallet) => ReactNode;
}) {
  const live = useRef<WalletSession | null>(null);
  const connecting = useRef(false);
  const ringOpening = useRef(false);
  const [localUnlock, setLocalUnlock] = useState<LocalRingUnlock>();
  const lease = useRef<Awaited<ReturnType<typeof acquireRingDevice>> | null>(null);
  const [ringBacked, setRingBacked] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const [lastBalance, setLastBalance] = useState<LastWalletBalance | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [notice, setNotice] = useState('');
  const [interrupted, setInterrupted] = useState<'legacy' | 'payment' | null>(null);
  const task = useWalletTask();
  useEffect(() => {
    if (window.top !== window.self) {
      setStage({ kind: 'framed' });
      return;
    }
    let session: WalletSession;
    try {
      session = new WalletSession(
        account,
        (balance) => {
          if (live.current !== session) return;
          setLastBalance(balance);
          if (!ringOpening.current) setStage({ kind: 'opening' });
        },
        (progress) => {
          if (live.current !== session) return;
          setStage((current) =>
            current.kind === 'wallet' && current.status === 'syncing' && current.session === session
              ? { ...current, progress }
              : current,
          );
        },
      );
    } catch {
      setNotice('This browser could not start the wallet worker.');
      setStage({ kind: 'unavailable' });
      return;
    }
    live.current = session;
    void session.inspect().then(
      (result) => {
        if (live.current !== session) return;
        setInterrupted(result.paymentNeedsReview ? 'payment' : result.interrupted ? 'legacy' : null);
        setLocalUnlock(result.ringUnlock);
        setStage({ kind: 'password', exists: result.exists || Boolean(result.ringUnlock) });
      },
      (err: unknown) => {
        if (live.current !== session) return;
        setNotice(err instanceof Error ? err.message : 'Wallet storage could not be opened.');
        setStage({ kind: 'unavailable' });
      },
    );
    return () => {
      live.current = null;
      const held = lease.current;
      lease.current = null;
      void closeDevice(session, held).catch(() => undefined);
    };
  }, [account]);

  function lostDevice(session: WalletSession) {
    if (live.current !== session) return;
    live.current = null;
    setNotice(
      'The wallet locked because it could not keep exclusive access to this Ring wallet. Reopen it to reconnect.',
    );
    setStage({ kind: 'unavailable' });
    return session.close();
  }
  async function holdDevice(
    session: WalletSession,
    network: Network,
    deviceId: string,
    intent: RingSetupMode | 'open',
    receipt?: string,
  ) {
    if (live.current !== session) throw new Error('Reopen your wallet to continue.');
    if (lease.current) {
      lease.current.assertActive();
      return lease.current;
    }
    const lost = () => lostDevice(session);
    const held = receipt
      ? await acquireRingDevice(account, network, deviceId, intent, lost, receipt)
      : await acquireRingDevice(account, network, deviceId, intent, lost);
    if (live.current !== session) {
      await held.release();
      throw new Error('Reopen your wallet to continue.');
    }
    held.assertActive();
    session.guardRingDevice(held.assertActive);
    lease.current = held;
    return held;
  }
  async function connect(wallet: ActiveWallet) {
    if (live.current !== wallet.session || connecting.current) return;
    connecting.current = true;
    setStage({ ...wallet, kind: 'wallet', status: 'syncing' });
    try {
      await wallet.session.client.startWallet();
      if (live.current === wallet.session) setStage({ ...wallet, kind: 'wallet', status: 'ready' });
    } catch (err) {
      if (live.current === wallet.session)
        setStage({
          ...wallet,
          kind: 'wallet',
          status: 'failed',
          message: err instanceof Error ? walletMessage(err.message) : 'Could not connect to the wallet network.',
        });
    } finally {
      connecting.current = false;
    }
  }

  function lock() {
    live.current = null;
    reset();
  }

  async function prepareMove(wallet: ActiveWallet) {
    const held = lease.current;
    if (!held) throw new RingEnrollmentError('Reopen the wallet on its current device.');
    held.assertActive();
    setNotice('');
    setStage({ kind: 'preparing-move' });
    let stopped = false;
    try {
      // Finish the channel and database checks while the mobile browser is still in front.
      const binding = await wallet.session.prepareHandoff(wallet.network);
      stopped = true;
      if (live.current !== wallet.session) return;
      held.assertActive();
      await held.release();
      if (live.current !== wallet.session) return;
      lease.current = null;
      setStage({
        kind: 'switch',
        status: 'offer',
        network: wallet.network,
        deviceId: binding.deviceId,
        sourceReceipt: binding.transferId,
        session: wallet.session,
      });
    } catch (error) {
      if (live.current !== wallet.session) return;
      setNotice(error instanceof Error ? walletMessage(error.message) : 'The wallet could not prepare this transfer.');
      const uncertain = error instanceof Error && 'code' in error && error.code === 'WALLET_CLOSE_UNCERTAIN';
      if (!stopped && !uncertain) {
        setStage({ ...wallet, kind: 'wallet', status: 'ready' });
        return;
      }
      lease.current = null;
      if (uncertain) await held.abandon().catch(() => {});
      await closeDevice(wallet.session, uncertain ? null : held).catch(() => {});
      if (live.current === wallet.session) setStage({ kind: 'switch-result', result: 'unpublished' });
    }
  }

  async function switchDevice(
    session: WalletSession,
    network: Network,
    deviceId: string,
    status: RingDeviceStatus | 'offer',
    key: Uint8Array,
    assertApproval: () => void,
    sourceReceipt?: string,
  ) {
    function current() {
      assertApproval();
      if (live.current !== session) throw new RingEnrollmentError('Reopen the wallet to continue.');
    }
    function report(completed: number, total: number) {
      if (live.current === session && total > 0) setProgress(Math.floor((100 * completed) / total));
    }
    current();
    setProgress(undefined);
    let result: TransferResult = 'incomplete';
    let publishedOffer: string | undefined;
    const claim =
      status !== 'offer' && status.state === 'handoff-ready' && status.sourceDeviceId !== deviceId ? status : undefined;
    if (status === 'offer') result = 'unpublished';
    try {
      if (status === 'offer') {
        // The node is stopped and its vault is still locked to this worker. Ring
        // may have been in front for longer than a homeserver lease. Acquire a
        // new lease and match the last installed receipt before allowing publication.
        const held = await holdDevice(session, network, deviceId, 'open', sourceReceipt);
        current();
        const transferId = crypto.randomUUID();
        const envelope = await session.exportHandoff(key, network, transferId, deviceId);
        try {
          current();
          publishedOffer = transferId;
          result = 'incomplete';
          await held.publishHandoff(transferId, envelope, report);
          result = 'offered';
        } finally {
          envelope.fill(0);
        }
      } else if (status.state === 'handoff-ready' && status.sourceDeviceId === deviceId) {
        await cancelRingHandoff(account, network, deviceId, status.transferId);
        result = 'kept';
      } else if (status.state === 'handoff-ready') {
        const held = await claimRingHandoff(
          account,
          network,
          deviceId,
          status.transferId,
          // A lost lease must stop the worker. Let this claim reconcile its receipt
          // after shutdown while this account is still mounted.
          () => session.close(),
          async (envelope, sourceDeviceId) => {
            current();
            if (sourceDeviceId !== status.sourceDeviceId)
              throw new RingEnrollmentError('The transfer has changed. Reopen the wallet.');
            const installed = await session.importHandoff(
              key,
              network,
              status.transferId,
              sourceDeviceId,
              deviceId,
              envelope,
            );
            if (installed.deviceId !== deviceId || installed.network !== network)
              throw new RingEnrollmentError('The installed wallet did not match this device.');
            current();
          },
          report,
        );
        lease.current = held;
        result = 'received';
      } else {
        throw new RingEnrollmentError('Prepare the transfer on your other device first.');
      }
    } catch (error) {
      if (live.current === session) {
        const safe = error instanceof Error && (!claim || error instanceof RingEnrollmentError);
        setNotice(safe ? walletMessage(error.message) : 'Could not finish this wallet transfer.');
      }
    } finally {
      key.fill(0);
      const held = lease.current;
      lease.current = null;
      try {
        await closeDevice(session, held);
      } catch {
        // The server expires the lease if it did not acknowledge the release.
      }
      if (result === 'incomplete' && (publishedOffer || claim) && live.current === session) {
        try {
          const observed = await inspectRingDevice(account, network, deviceId);
          if (claim) {
            if (observed.state === 'this-device' && observed.transferId === claim.transferId) {
              result = 'received';
            } else if (
              observed.state === 'handoff-ready' &&
              observed.sourceDeviceId === claim.sourceDeviceId &&
              observed.transferId === claim.transferId
            ) {
              result = 'still-ready';
            }
          } else if (
            observed.state === 'handoff-ready' &&
            observed.sourceDeviceId === deviceId &&
            observed.transferId === publishedOffer
          ) {
            result = 'offered';
          } else if (observed.state === 'other-device' && observed.transferId === publishedOffer) {
            result = 'moved-away';
          } else if (observed.state === 'this-device' && observed.transferId === (sourceReceipt ?? null)) {
            result = 'unpublished';
          }
        } catch {
          // A lost write acknowledgement needs an authoritative read before reporting its outcome.
        }
      }
      if (live.current === session) {
        if (result === 'received' || result === 'offered' || result === 'moved-away') setNotice('');
        setProgress(undefined);
        setStage({ kind: 'switch-result', result });
      }
    }
  }

  async function openRingWallet(wallet: ActiveWallet, binding: RingBinding, retrying = false) {
    const { session, network } = wallet;
    let held: RingDeviceLease;
    try {
      held = await holdDevice(session, network, binding.deviceId, 'open', binding.transferId);
    } catch (error) {
      if (live.current !== session) return;
      if (!(error instanceof RingEnrollmentError)) throw error;
      const status = await inspectRingDevice(account, network, binding.deviceId);
      if (live.current !== session) return;
      if (status.state === 'handoff-ready' || status.state === 'other-device') {
        setStage({ kind: 'switch', session, network, deviceId: binding.deviceId, status });
        return;
      }
      if (error instanceof RingDeviceBusyError && status.state === 'this-device') {
        if (status.transferId !== (binding.transferId ?? null))
          throw new RingEnrollmentError('The wallet device record changed. Reopen the wallet to check its owner.');
        setStage({ kind: 'waiting-for-device', wallet, binding });
        return;
      }
      throw error;
    }
    if (live.current !== session) return;
    if (retrying && document.hidden) {
      // The browser went into the background during the request. No engine has started.
      lease.current = null;
      await held.release();
      if (live.current === session) setStage({ kind: 'waiting-for-device', wallet, binding });
      return;
    }
    setRecovering(binding.mode === 'restore' && !binding.transferId);
    void connect(wallet);
  }

  const retryDevice = useEffectEvent(({ wallet, binding }: WaitingForDevice) => {
    void task.run(async () => {
      try {
        await openRingWallet(wallet, binding, true);
      } catch (error) {
        if (live.current !== wallet.session) return;
        setStage({ kind: 'start', id: wallet.id, network: wallet.network });
        throw error;
      }
    });
  });
  useEffect(() => {
    if (stage.kind !== 'waiting-for-device') return;
    const waiting = stage;
    const retryAt = Date.now() + 10_000;
    let timer: number | undefined;
    let sent = false;
    function schedule() {
      window.clearTimeout(timer);
      if (sent || document.hidden) return;
      timer = window.setTimeout(
        () => {
          if (document.hidden || live.current !== waiting.wallet.session) return;
          sent = true;
          retryDevice(waiting);
        },
        Math.max(0, retryAt - Date.now()),
      );
    }
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [stage]);

  async function start(session: WalletSession, id: string, network: Network) {
    if (live.current !== session) return;
    session.client.selectWallet(id);
    setStage({ kind: 'start', id, network, checking: 'vault' });
    try {
      const binding = await session.ringBinding();
      if (live.current !== session) return;
      setRingBacked(Boolean(binding));
      const wallet = { session, id, network };
      if (binding) {
        if (binding.network !== network)
          throw new RingEnrollmentError('The Ring wallet and this Bitcoin network do not match.');
        setStage({ kind: 'start', id, network, checking: 'device' });
        await openRingWallet(wallet, binding);
      } else {
        void connect(wallet);
      }
    } catch (error) {
      if (live.current !== session) return;
      setStage({ kind: 'start', id, network });
      throw error;
    }
  }
  async function openExisting(session: WalletSession, records: WalletRecord[]) {
    if (records.length !== 1) {
      setNotice('This vault contains more than one wallet. Lock it and verify the vault before continuing.');
      setStage({ kind: 'unavailable' });
      return;
    }
    await start(session, records[0].id, records[0].network);
  }
  async function unlock(password: string) {
    const session = live.current;
    if (!session) return;
    let defaults;
    try {
      defaults = await session.open(password);
    } catch (error) {
      if (live.current === session) {
        setLastBalance(null);
        setStage({ kind: 'password', exists: stage.kind === 'password' && stage.exists, showPassword: true });
      }
      throw error;
    }
    await opened(session, defaults);
  }
  async function opened(session: WalletSession, defaults: WalletDefaults) {
    if (live.current !== session) return;
    let records: WalletRecord[];
    try {
      records = await session.client.listWallets();
    } catch (error) {
      if (live.current === session) setStage({ kind: 'unavailable' });
      throw error;
    }
    if (live.current !== session) return;
    if (records.length) await openExisting(session, records);
    else {
      const binding = await session.ringBinding();
      if (live.current !== session) return;
      setStage({ kind: 'ring', defaults, network: defaults.network, session, reserved: Boolean(binding) });
    }
  }
  async function requestLocalApproval(operation: 'new' | 'unlock' | 'enroll', active?: ActiveWallet) {
    const session = live.current;
    if (!session) return;
    const scope = operation === 'unlock' ? localUnlock : await session.prepareLocalUnlock();
    if (!scope || live.current !== session) return;
    setStage({ kind: 'local-approval', scope, operation, previous: operation === 'new' ? 'new' : 'existing', active });
  }

  async function approvedLocal(key: Uint8Array, assertCurrent: () => void) {
    if (stage.kind !== 'local-approval') return;
    const { operation, scope, active } = stage;
    const session = live.current;
    if (!session) return;
    assertCurrent();
    try {
      if (operation === 'enroll' && active) {
        lease.current?.assertActive();
        const enrolled = await session.enrollLocalUnlock(key, scope);
        assertCurrent();
        setLocalUnlock(enrolled);
        setNotice('Ring unlock is ready on this device. Your password still works.');
        setStage({ ...active, kind: 'wallet', status: 'ready' });
      } else {
        ringOpening.current = true;
        const defaults = await session.openWithRing(key, scope, operation === 'new');
        assertCurrent();
        if (live.current !== session) return;
        if (operation === 'new') setLocalUnlock({ ...scope, passwordAvailable: false });
        await opened(session, defaults);
      }
    } catch (error) {
      // The local unlock record can reach disk before a relay failure. A fresh
      // inspection picks up that credential and never retries a consumed setup intent.
      const held = lease.current;
      lease.current = null;
      await closeDevice(session, held).catch(() => {});
      if (live.current === session) {
        setNotice(error instanceof Error ? walletMessage(error.message) : 'Reopen the wallet to check Ring unlock.');
        setStage({ kind: 'unavailable' });
      }
    } finally {
      ringOpening.current = false;
    }
  }
  async function create(mnemonic?: string) {
    const session = live.current;
    if (!session || stage.kind !== 'empty') return;
    // Recheck the record before retrying a creation whose response could have been interrupted.
    const records = await session.client.listWallets();
    if (live.current !== session) return;
    if (records.length) return openExisting(session, records);
    const created = await session.client.createWallet({
      ...stage.defaults,
      name: 'Pubky wallet',
      ...(mnemonic ? { mnemonic, recoveryAutoApply: true } : {}),
    });
    if (live.current !== session) return;
    session.client.selectWallet(created.id);
    setRingBacked(false);
    setStage({ kind: 'start', id: created.id, network: created.network });
    setNotice(created.warnings?.join(' ') || '');
    if (mnemonic) {
      setRecovering(true);
      return start(session, created.id, created.network);
    }
    const phrase = created.mnemonic || (await session.client.getRecoveryPhrase());
    if (live.current === session) setStage({ kind: 'backup', id: created.id, network: created.network, phrase });
  }
  const connectionNotice =
    stage.kind === 'wallet' &&
    stage.status !== 'ready' &&
    (stage.status === 'failed' ? (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
        <span>{stage.message}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={task.busy}
          onClick={() => void connect({ session: stage.session, id: stage.id, network: stage.network })}
        >
          Retry connection
        </Button>
      </div>
    ) : (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" aria-hidden className="motion-reduce:animate-none" /> {startMessage(stage.progress)}
      </div>
    ));
  return (
    <>
      {task.error && (
        <p role="alert" className="rounded-xl border border-destructive/50 p-4 text-sm text-foreground">
          {task.error}
        </p>
      )}
      {stage.kind === 'checking' && <Spinner aria-label="Checking wallet" />}
      {stage.kind === 'framed' && (
        <WalletPanel title="Open your wallet" icon={WalletIcon}>
          <p className="text-muted-foreground">
            {renderReady
              ? 'Open this post directly in Pubky and return to checkout to fund your Bitkit.'
              : 'Open Pubky directly to use the wallet stored in this browser.'}
          </p>
          <Button asChild variant="brand" className="self-start">
            <a
              href={
                renderReady
                  ? window.location.pathname
                  : recipient
                    ? APP_ROUTES.WALLET + '?recipient=' + encodeURIComponent(recipient)
                    : APP_ROUTES.WALLET
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {renderReady ? 'Open Pubky in a new tab' : 'Open wallet in a new tab'} <ArrowRight />
            </a>
          </Button>
        </WalletPanel>
      )}
      {stage.kind === 'unavailable' && (
        <Button className="self-start" onClick={reset}>
          Try again
        </Button>
      )}
      {stage.kind === 'password' && !stage.showPassword && (!stage.exists || localUnlock) && (
        <WalletPanel title={stage.exists ? 'Unlock wallet' : 'Unlock this wallet with Ring'} icon={KeyRound}>
          <p className="text-sm text-muted-foreground">
            {stage.exists
              ? 'Approve in Pubky Ring to open your wallet on this device.'
              : 'Use Pubky Ring to protect the wallet in this browser. Each unlock needs your approval.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="brand"
              disabled={task.busy}
              onClick={() => void task.run(() => requestLocalApproval(stage.exists ? 'unlock' : 'new'))}
            >
              {stage.exists ? 'Unlock with Ring' : 'Set up with Ring'}
            </Button>
            {(!stage.exists || localUnlock?.passwordAvailable) && (
              <Button
                type="button"
                variant="outline"
                disabled={task.busy}
                onClick={() => setStage({ ...stage, showPassword: true })}
              >
                Use a password instead
              </Button>
            )}
          </div>
        </WalletPanel>
      )}
      {stage.kind === 'password' && (stage.showPassword || (stage.exists && !localUnlock)) && (
        <PasswordForm
          exists={stage.exists}
          busy={task.busy}
          submit={(password) => task.run(() => unlock(password))}
          useRing={
            !stage.exists || localUnlock
              ? () => void task.run(() => requestLocalApproval(stage.exists ? 'unlock' : 'new'))
              : undefined
          }
        />
      )}
      {stage.kind === 'local-approval' && (
        <WalletKeyApproval
          account={account}
          network={stage.scope.network}
          localDeviceId={stage.scope.deviceId}
          title={stage.operation === 'unlock' ? 'Unlock with Ring' : 'Set up Ring unlock'}
          description={
            stage.operation === 'unlock'
              ? 'Approve this request in Ring to unlock this browser’s wallet.'
              : 'Approve the device unlock permission in Ring. It protects the encrypted wallet in this browser.'
          }
          workingLabel={stage.operation === 'unlock' ? 'Opening your wallet…' : 'Protecting your wallet…'}
          onKey={approvedLocal}
          onCancel={() =>
            stage.active
              ? setStage({ ...stage.active, kind: 'wallet', status: 'ready' })
              : setStage({ kind: 'password', exists: stage.previous === 'existing' })
          }
        />
      )}
      {stage.kind === 'preparing-move' && (
        <WalletPanel title="Preparing your transfer" icon={WalletIcon}>
          <p role="status">Saving and checking the wallet on this device…</p>
        </WalletPanel>
      )}
      {stage.kind === 'switch' && (
        <WalletDeviceSwitch
          key={stage.status === 'offer' ? 'offer' : stage.status.state}
          account={account}
          network={stage.network}
          action={
            stage.status === 'offer'
              ? 'offer'
              : stage.status.state === 'handoff-ready'
                ? stage.status.sourceDeviceId === stage.deviceId
                  ? 'keep'
                  : 'take'
                : 'elsewhere'
          }
          progress={progress}
          onApprove={(key, assertCurrent) =>
            switchDevice(
              stage.session,
              stage.network,
              stage.deviceId,
              stage.status,
              key,
              assertCurrent,
              stage.sourceReceipt,
            )
          }
          onRefresh={async (signal) => {
            const status = await inspectRingDevice(account, stage.network, stage.deviceId);
            if (signal.aborted || live.current !== stage.session) return;
            if (status.state === 'this-device') lock();
            else setStage({ ...stage, status });
            return status.state;
          }}
          onClose={lock}
        />
      )}
      {stage.kind === 'switch-result' && (
        <WalletPanel
          title={
            {
              offered: 'Ready on your other device',
              'moved-away': 'Wallet moved to your other device',
              received: 'Wallet moved to this device',
              'still-ready': 'Wallet is still ready to move',
              kept: 'Wallet kept on this device',
              unpublished: 'Transfer was not shared',
              incomplete: 'Check your transfer',
            }[stage.result]
          }
          icon={WalletIcon}
        >
          <p className="text-sm text-muted-foreground" role="status">
            {
              {
                offered:
                  'Sign in to the same Pubky account on your other device. Open Wallet and choose “Use wallet on this device”. Payments are paused here.',
                'moved-away': 'Open Wallet on the device that received the transfer.',
                received: 'Unlock your wallet to reconnect your channels and see your Activity.',
                'still-ready': 'Unlock this wallet and approve the transfer in Ring to try again.',
                kept: 'The transfer was cancelled. You can unlock your wallet here.',
                unpublished: 'Your local wallet data is still on this device.',
                incomplete:
                  'Reopen Wallet to check which device owns it. Keep the wallet data in both browsers until the move finishes.',
              }[stage.result]
            }
          </p>
          <Button type="button" variant="brand" className="self-start" onClick={lock}>
            {['offered', 'moved-away'].includes(stage.result)
              ? 'Done'
              : stage.result === 'incomplete'
                ? 'Reopen wallet'
                : 'Unlock wallet'}
          </Button>
        </WalletPanel>
      )}
      {stage.kind === 'empty' && (
        <CreateForm
          network={stage.network}
          busy={task.busy}
          submit={(words) => task.run(() => create(words))}
          useRing={() => {
            if (live.current) setStage({ ...stage, kind: 'ring', session: live.current, reserved: false });
          }}
        />
      )}
      {stage.kind === 'ring' && (
        <WalletRingSetup
          account={account}
          network={stage.network}
          session={stage.session}
          progress={progress}
          onHandoff={(status, deviceId, key, assertCurrent) =>
            switchDevice(stage.session, stage.network, deviceId, status, key, assertCurrent)
          }
          localRingOnly={Boolean(localUnlock && !localUnlock.passwordAvailable)}
          onPhrase={
            stage.reserved
              ? undefined
              : () => {
                  void task.run(async () => {
                    const binding = await stage.session.ringBinding();
                    if (live.current !== stage.session) return;
                    if (binding || lease.current)
                      throw new Error(
                        'This browser is already setting up its Ring wallet. Lock it and reopen to continue.',
                      );
                    setStage({ kind: 'empty', defaults: stage.defaults, network: stage.network });
                  });
                }
          }
          onCancel={lock}
          onKey={async (key, assertCurrent, mode, deviceId) => {
            const session = stage.session;
            assertCurrent();
            const held = await holdDevice(session, stage.network, deviceId, mode);
            assertCurrent();
            if (live.current !== session) throw new Error('Reopen your wallet to continue.');
            const created = await session.createRingWallet(key, stage.network, held.mode);
            if (live.current !== session) return;
            assertCurrent();
            setRingBacked(true);
            setRecovering(mode === 'restore');
            await task.run(() => start(session, created.id, created.network));
          }}
        />
      )}
      {stage.kind === 'backup' && (
        <WalletPanel title="Back up your wallet" icon={KeyRound}>
          <RecoveryWords phrase={stage.phrase} />
          <Button
            variant="brand"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                if (live.current) await start(live.current, stage.id, stage.network);
              })
            }
          >
            I saved my words <ArrowRight />
          </Button>
        </WalletPanel>
      )}
      {(stage.kind === 'opening' || (stage.kind === 'start' && (stage.checking || task.busy))) && (
        <WalletOpening
          lock={lock}
          balance={
            lastBalance &&
            (stage.kind === 'opening' || (lastBalance.walletId === stage.id && lastBalance.network === stage.network))
              ? lastBalance
              : null
          }
          message={
            stage.kind === 'start' && stage.checking === 'device' ? 'Checking device access…' : 'Preparing your wallet…'
          }
        />
      )}
      {stage.kind === 'waiting-for-device' && (
        <WalletPanel title="Waiting for wallet access" icon={LockKeyhole}>
          <p role="status" className="text-sm text-muted-foreground">
            This wallet is registered to this device. It will open automatically when the previous session releases
            it. If you still have another copy open, lock it there.
          </p>
          <Button type="button" variant="outline" className="self-start" onClick={lock}>
            Lock wallet
          </Button>
        </WalletPanel>
      )}
      {stage.kind === 'start' && !stage.checking && !task.busy && (
        <WalletPanel title="Open wallet" icon={WalletIcon}>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                task.run(async () => {
                  if (live.current) await start(live.current, stage.id, stage.network);
                })
              }
            >
              Retry connection
            </Button>
            {ringBacked === false && (
              <Button
                variant="outline"
                onClick={() =>
                  task.run(async () => {
                    const session = live.current;
                    if (!session) return;
                    const phrase = await session.client.getRecoveryPhrase();
                    if (live.current === session)
                      setStage({ kind: 'backup', id: stage.id, network: stage.network, phrase });
                  })
                }
              >
                Back up wallet
              </Button>
            )}
          </div>
        </WalletPanel>
      )}
      {stage.kind === 'wallet' &&
        (renderReady ? (
          stage.status === 'ready' ? (
            <>
              {interrupted === 'payment' && (
                <p role="status" className="rounded-xl border border-border p-4 text-sm">
                  A previous payment still needs review. Check{' '}
                  <a className="underline" href={APP_ROUTES.WALLET}>
                    Activity in Pubky Wallet
                  </a>{' '}
                  before sending it again.
                </p>
              )}
              <WalletCheckoutRecovery walletId={stage.id} session={stage.session} recovering={recovering}>
                {renderReady({ session: stage.session, network: stage.network, task })}
              </WalletCheckoutRecovery>
            </>
          ) : (
            connectionNotice
          )
        ) : (
          <WalletDashboard
            key={JSON.stringify([stage.id, recipient])}
            session={stage.session}
            connection={stage.status}
            connectionNotice={connectionNotice}
            walletId={stage.id}
            ringBacked={ringBacked === true}
            recovering={recovering}
            onEnableRingUnlock={
              !localUnlock && stage.status === 'ready'
                ? () =>
                    void task.run(() =>
                      requestLocalApproval('enroll', { id: stage.id, network: stage.network, session: stage.session }),
                    )
                : undefined
            }
            onMoveWallet={
              ringBacked && stage.status === 'ready' ? () => void task.run(() => prepareMove(stage)) : undefined
            }
            interrupted={interrupted}
            onPaymentReviewed={() => setInterrupted(null)}
            lastBalance={
              lastBalance?.walletId === stage.id && lastBalance.network === stage.network ? lastBalance : null
            }
            network={stage.network}
            recipient={recipient}
            task={task}
            lock={lock}
          />
        ))}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </>
  );
}

function PasswordForm({
  exists,
  busy,
  submit,
  useRing,
}: {
  exists: boolean;
  busy: boolean;
  submit: (value: string) => Promise<void>;
  useRing?: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mismatch = !exists && confirmation.length > 0 && password !== confirmation;
  return (
    <WalletPanel
      title={exists ? 'Unlock wallet' : 'Protect your wallet in this browser'}
      icon={exists ? LockKeyhole : WalletIcon}
    >
      <p className="text-muted-foreground">
        {exists
          ? 'Enter your wallet password to unlock it on this device.'
          : 'Choose a password to protect this browser’s wallet data. It can be different on each device. Next, we’ll check for a wallet linked to your Pubky Ring identity.'}
      </p>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mismatch) void submit(password);
        }}
      >
        <Label htmlFor="wallet-password">{exists ? 'Password' : 'New wallet password'}</Label>
        <Input
          id="wallet-password"
          type="password"
          required
          minLength={exists ? 1 : 12}
          autoComplete={exists ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={exists ? undefined : 'At least 12 characters'}
        />
        {!exists && (
          <>
            <Label htmlFor="wallet-password-confirm">Confirm password</Label>
            <Input
              id="wallet-password-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmation}
              aria-invalid={mismatch}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            {mismatch && <span className="text-sm text-muted-foreground">The passwords must match.</span>}
          </>
        )}
        <Button
          variant="brand"
          type="submit"
          className="justify-self-start"
          disabled={busy || !password || (!exists && (password.length < 12 || password !== confirmation))}
        >
          {busy ? 'Unlocking this browser…' : exists ? 'Unlock wallet' : 'Continue'} <ArrowRight />
        </Button>
      </form>
      {useRing && (
        <Button type="button" variant="ghost" className="self-start" disabled={busy} onClick={useRing}>
          Use Ring instead
        </Button>
      )}
    </WalletPanel>
  );
}

function CreateForm({
  useRing,
  network,
  busy,
  submit,
}: {
  network: Network;
  busy: boolean;
  submit: (words?: string) => Promise<void>;
  useRing: () => void;
}) {
  const [restore, setRestore] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [closed, setClosed] = useState(false);
  return (
    <WalletPanel title={restore ? 'Restore wallet' : 'Create your wallet'} icon={restore ? KeyRound : WalletIcon}>
      <p className="text-muted-foreground">
        {restore ? 'Restore a Beignet wallet on ' : 'Your wallet will use Bitcoin '}
        {network}.
      </p>
      {restore && (
        <div className="grid gap-3">
          <Label htmlFor="wallet-restore-words">Recovery phrase</Label>
          <Textarea
            id="wallet-restore-words"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
          <Checkbox
            checked={closed}
            onCheckedChange={(v) => setClosed(v === true)}
            label="I closed my previous wallet and will keep it closed."
          />
          <p className="text-sm text-muted-foreground">
            The wallet will look for channel backups with its recovery peer. Running both copies can put channel funds
            at risk.
          </p>
        </div>
      )}
      {!restore && (
        <Button variant="brand" className="self-start" disabled={busy} onClick={useRing}>
          <KeyRound /> Use Pubky Ring
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={restore ? 'brand' : 'outline'}
          disabled={busy || (restore && (!phrase.trim() || !closed))}
          onClick={() => void submit(restore ? phrase.trim() : undefined)}
        >
          {busy ? 'Preparing wallet…' : restore ? 'Restore wallet' : 'Create with recovery phrase'}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setRestore(!restore);
            setPhrase('');
            setClosed(false);
          }}
        >
          {restore ? 'Back' : 'Restore from phrase'}
        </Button>
      </div>
    </WalletPanel>
  );
}
