'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { CreateWalletInput, Network, WalletRecord } from '@beignet/wallet-core';
import { ArrowRight, KeyRound, LockKeyhole, Wallet as WalletIcon } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { acquireRingDevice } from '@/services/wallet/ring-enrollment';
import { type LastWalletBalance, WalletSession } from '@/services/wallet/session';
import { WalletDashboard } from './WalletDashboard';
import { WalletOpening } from './WalletOpening';
import { RecoveryWords, useWalletTask, WalletPanel, type WalletTask } from './WalletPanel';
import { type RingSetupMode, WalletRingSetup } from './WalletRingSetup';

type Stage =
  | { kind: 'checking' | 'unavailable' | 'framed' }
  | { kind: 'opening' }
  | { kind: 'password'; exists: boolean }
  | { kind: 'empty'; defaults: CreateWalletInput; network: Network }
  | { kind: 'ring'; defaults: CreateWalletInput; network: Network; session: WalletSession; reserved: boolean }
  | { kind: 'backup'; id: string; network: Network; phrase: string }
  | { kind: 'start'; id: string; network: Network }
  | { kind: 'ready'; id: string; network: Network; session: WalletSession };

export type UnlockedWallet = { session: WalletSession; network: Network; task: WalletTask };

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
  const lease = useRef<Awaited<ReturnType<typeof acquireRingDevice>> | null>(null);
  const [ringBacked, setRingBacked] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const [lastBalance, setLastBalance] = useState<LastWalletBalance | null>(null);
  const [checkingDevice, setCheckingDevice] = useState(false);
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
      session = new WalletSession(account, (balance) => {
        if (live.current !== session) return;
        setLastBalance(balance);
        setStage({ kind: 'opening' });
      });
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
        setStage({ kind: 'password', exists: result.exists });
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
      void session
        .close()
        .then(() => held?.release())
        .catch(() => undefined);
    };
  }, [account]);

  async function holdDevice(
    session: WalletSession,
    network: Network,
    deviceId: string,
    intent: RingSetupMode | 'open',
  ) {
    if (live.current !== session) throw new Error('Reopen your wallet to continue.');
    if (lease.current) {
      lease.current.assertActive();
      return lease.current;
    }
    const held = await acquireRingDevice(account, network, deviceId, intent, () => {
      if (live.current !== session) return;
      live.current = null;
      setNotice(
        'The wallet locked because it could not keep exclusive access to this Ring wallet. Reopen it to reconnect.',
      );
      setStage({ kind: 'unavailable' });
      return session.close();
    });
    if (live.current !== session) {
      await held.release();
      throw new Error('Reopen your wallet to continue.');
    }
    held.assertActive();
    session.guardRingDevice(held.assertActive);
    lease.current = held;
    return held;
  }
  async function start(session: WalletSession, id: string, network: Network) {
    if (live.current !== session) return;
    session.client.selectWallet(id);
    setStage({ kind: 'start', id, network });
    const binding = await session.ringBinding();
    if (live.current !== session) return;
    setRingBacked(Boolean(binding));
    if (binding) {
      if (binding.network !== network) throw new Error('The Ring wallet and this Bitcoin network do not match.');
      setCheckingDevice(true);
      try {
        await holdDevice(session, network, binding.deviceId, 'open');
      } finally {
        if (live.current === session) setCheckingDevice(false);
      }
      if (live.current !== session) return;
    }
    await session.client.startWallet();
    if (live.current === session) setStage({ kind: 'ready', id, network, session });
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
        setStage({ kind: 'password', exists: stage.kind === 'password' && stage.exists });
      }
      throw error;
    }
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
    setStage({ kind: 'start', id: created.id, network: created.network });
    setNotice(created.warnings?.join(' ') || '');
    if (mnemonic) return start(session, created.id, created.network);
    const phrase = created.mnemonic || (await session.client.getRecoveryPhrase());
    if (live.current === session) setStage({ kind: 'backup', id: created.id, network: created.network, phrase });
  }
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
      {stage.kind === 'password' && (
        <PasswordForm exists={stage.exists} busy={task.busy} submit={(password) => task.run(() => unlock(password))} />
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
          onCancel={() => {
            void stage.session
              .close()
              .then(reset)
              .catch(() => setNotice('Reopen the wallet to continue.'));
          }}
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
      {(stage.kind === 'opening' || (stage.kind === 'start' && task.busy)) && (
        <WalletOpening
          balance={
            lastBalance &&
            (stage.kind === 'opening' || (lastBalance.walletId === stage.id && lastBalance.network === stage.network))
              ? lastBalance
              : null
          }
          message={
            stage.kind === 'opening'
              ? 'Preparing your wallet…'
              : checkingDevice
                ? 'Checking device access…'
                : 'Syncing Bitcoin and connecting to Lightning…'
          }
        />
      )}
      {stage.kind === 'start' && !task.busy && (
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
            {!ringBacked && (
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
      {stage.kind === 'ready' &&
        (renderReady ? (
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
            {renderReady({ session: stage.session, network: stage.network, task })}
          </>
        ) : (
          <WalletDashboard
            key={JSON.stringify([stage.id, recipient])}
            session={stage.session}
            walletId={stage.id}
            ringBacked={ringBacked}
            interrupted={interrupted}
            onPaymentReviewed={() => setInterrupted(null)}
            lastBalance={
              lastBalance?.walletId === stage.id && lastBalance.network === stage.network ? lastBalance : null
            }
            network={stage.network}
            recipient={recipient}
            task={task}
            lock={() =>
              task.run(async () => {
                await live.current?.close();
                reset();
              })
            }
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
}: {
  exists: boolean;
  busy: boolean;
  submit: (value: string) => Promise<void>;
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
