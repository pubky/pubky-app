'use client';

import { type ReactNode, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/atoms/Card/Card';
import { Heading } from '@/atoms/Heading/Heading';

export function WalletPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Card className="gap-5 rounded-2xl border border-border p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <Icon className="size-5 text-brand" aria-hidden />
        <Heading level={2} size="md">
          {title}
        </Heading>
      </div>
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
      setError(err instanceof Error ? err.message : 'The wallet could not complete this action.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, clearError: () => setError(''), run };
}
export type WalletTask = ReturnType<typeof useWalletTask>;
