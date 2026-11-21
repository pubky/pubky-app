'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, type LucideIcon } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Heading } from '@/atoms/Heading/Heading';
import { walletMessage } from '@/libs/wallet/amount';

export type WalletNavigation = {
  back: () => void;
  lock: () => void;
  busy: boolean;
  balance: ReactNode;
  notices: ReactNode;
};

export function WalletPanel({
  title,
  icon: Icon,
  children,
  navigation,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  navigation?: WalletNavigation;
}) {
  const backButton = useRef<HTMLButtonElement>(null);
  const isPaymentScreen = !!navigation;
  useEffect(() => {
    if (isPaymentScreen) {
      backButton.current?.focus({ preventScroll: true });
      backButton.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [isPaymentScreen]);
  return (
    <Card
      className={
        navigation
          ? 'gap-4 rounded-2xl border border-border p-4 sm:gap-5 sm:p-6'
          : 'gap-5 rounded-2xl border border-border p-5 sm:p-7'
      }
    >
      <div className="flex items-center gap-3">
        {navigation ? (
          <Button
            ref={backButton}
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back to wallet"
            disabled={navigation.busy}
            onClick={navigation.back}
          >
            <ArrowLeft />
          </Button>
        ) : (
          <Icon className="size-5 text-brand" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <Heading level={2} size="md">
            {title}
          </Heading>
          {navigation?.balance}
        </div>
        {navigation && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Lock wallet"
            disabled={navigation.busy}
            onClick={navigation.lock}
          >
            <LockKeyhole />
          </Button>
        )}
      </div>
      {navigation?.notices}
      {children}
    </Card>
  );
}

export function RecoveryWords({ phrase }: { phrase: string }) {
  return (
    <div className="sentry-block grid gap-4" data-sentry-block>
      <p className="text-sm text-muted-foreground">
        Write these words down in order and keep them private. Anyone with the words can access your bitcoin. Restoring
        Lightning funds also requires up-to-date channel backups from your recovery peer.
      </p>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background p-4 sm:grid-cols-3">
        {phrase
          .trim()
          .split(/\s+/)
          .map((word, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
              <strong>{word}</strong>
            </li>
          ))}
      </ol>
    </div>
  );
}

export function useWalletTask() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? walletMessage(err.message) : 'The wallet could not complete this action.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, clearError: () => setError(''), run };
}
export type WalletTask = ReturnType<typeof useWalletTask>;

export function Detail({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 border-b border-border py-1.5'
          : 'grid gap-1 border-b border-border pb-2'
      }
    >
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={compact ? 'text-right text-sm font-medium wrap-anywhere tabular-nums' : 'text-sm wrap-anywhere'}>
        {value}
      </dd>
    </div>
  );
}
export function Warnings({ items }: { items: string[] }) {
  return items.length ? (
    <ul className="grid gap-2 rounded-xl border border-border p-3 text-sm">
      {items.map((item, i) => (
        <li key={i}>{walletMessage(item)}</li>
      ))}
    </ul>
  ) : null;
}
