import { Bitcoin } from 'lucide-react';
import { Card } from '@/atoms/Card/Card';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { bitcoinAmount } from '@/libs/wallet/amount';
import type { LastWalletBalance } from '@/services/wallet/session';

export function SavedBalance({ balance }: { balance: LastWalletBalance }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Last verified balance</p>
      <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-6xl">
        {bitcoinAmount(balance.totalSats)}
      </p>
      <time className="text-xs text-muted-foreground" dateTime={new Date(balance.updatedAt).toISOString()}>
        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(balance.updatedAt)}
      </time>
    </div>
  );
}

export function WalletOpening({ balance, message }: { balance: LastWalletBalance | null; message: string }) {
  return (
    <Card className="gap-6 rounded-2xl border border-border p-5 sm:p-7">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bitcoin aria-hidden className="size-5 text-brand" /> Bitcoin
        {balance && <span className="rounded-full border border-border px-2 py-0.5 text-xs">{balance.network}</span>}
      </div>
      {balance ? (
        <SavedBalance balance={balance} />
      ) : (
        <div aria-hidden className="space-y-3 py-1 motion-safe:animate-pulse">
          <div className="h-3 w-24 rounded-full bg-secondary" />
          <div className="h-9 w-40 rounded-md bg-secondary" />
        </div>
      )}
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" aria-hidden className="motion-reduce:animate-none" />
        {message}
      </div>
    </Card>
  );
}
