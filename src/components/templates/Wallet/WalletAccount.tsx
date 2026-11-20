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
import { WalletSession } from '@/services/wallet/session';
import { WalletDashboard } from './WalletDashboard';
import { RecoveryWords, useWalletTask, WalletPanel, type WalletTask } from './WalletPanel';

type Stage =
  | { kind: 'checking' | 'unavailable' | 'framed' }
  | { kind: 'password'; exists: boolean }
  | { kind: 'empty'; defaults: CreateWalletInput; network: Network }
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
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const [notice, setNotice] = useState('');
  const [interrupted, setInterrupted] = useState(false);
  const task = useWalletTask();
  useEffect(() => {
    if (window.top !== window.self) {
      setStage({ kind: 'framed' });
      return;
    }
    let session: WalletSession;
    try {
      session = new WalletSession(account);
    } catch {
      setNotice('This browser could not start the wallet worker.');
      setStage({ kind: 'unavailable' });
      return;
    }
    live.current = session;
    void session.inspect().then(
      (result) => {
        if (live.current !== session) return;
        setInterrupted('interrupted' in result && result.interrupted === true);
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
      void session.close().catch(() => undefined);
    };
  }, [account]);

  async function start(session: WalletSession, id: string, network: Network) {
    if (live.current !== session) return;
    session.client.selectWallet(id);
    setStage({ kind: 'start', id, network });
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
    const defaults = await session.open(password);
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
    else setStage({ kind: 'empty', defaults, network: defaults.network });
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
      {interrupted && (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          The wallet stopped unexpectedly. Check Activity before retrying a payment.
        </p>
      )}
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
        <CreateForm network={stage.network} busy={task.busy} submit={(words) => task.run(() => create(words))} />
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
      {stage.kind === 'start' && (
        <WalletPanel title="Open wallet" icon={WalletIcon}>
          {task.busy ? (
            <Spinner aria-label="Starting wallet" />
          ) : (
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
            </div>
          )}
        </WalletPanel>
      )}
      {stage.kind === 'ready' &&
        (renderReady ? (
          renderReady({ session: stage.session, network: stage.network, task })
        ) : (
          <WalletDashboard
            key={JSON.stringify([stage.id, recipient])}
            session={stage.session}
            walletId={stage.id}
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
      title={exists ? 'Unlock wallet' : 'Set up your Bitcoin wallet'}
      icon={exists ? LockKeyhole : WalletIcon}
    >
      <p className="text-muted-foreground">
        {exists
          ? 'Enter your wallet password to unlock it on this device.'
          : 'Choose a password to encrypt your wallet on this device. You can then create a wallet or restore one from its recovery phrase.'}
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
          {busy ? 'Opening wallet…' : exists ? 'Unlock wallet' : 'Continue'} <ArrowRight />
        </Button>
      </form>
    </WalletPanel>
  );
}

function CreateForm({
  network,
  busy,
  submit,
}: {
  network: Network;
  busy: boolean;
  submit: (words?: string) => Promise<void>;
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
      <div className="flex flex-wrap gap-2">
        <Button
          variant="brand"
          disabled={busy || (restore && (!phrase.trim() || !closed))}
          onClick={() => void submit(restore ? phrase.trim() : undefined)}
        >
          {busy ? 'Preparing wallet…' : restore ? 'Restore wallet' : 'Create wallet'}
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
