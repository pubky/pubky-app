'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import type { WalletStartupPhase } from '@/services/wallet/session';

type LocalPhase =
  | 'unlock'
  | 'vault-unlocked'
  | 'vault-open'
  | 'lease-start'
  | 'engine-requested'
  | 'spinner-shown'
  | 'spinner-cleared'
  | 'dashboard-connected';
export type Timing = { phase: WalletStartupPhase | LocalPhase; durationMs?: number };
type Reading = Timing & { elapsedMs: number };
const labels: Record<Timing['phase'], string> = {
  unlock: 'Unlock pressed',
  'vault-unlocked': 'Local vault decrypted',
  'vault-open': 'Wallet runtime opened',
  'lease-start': 'Ring device check started',
  lease: 'Ring device access verified',
  'engine-requested': 'Engine start requested',
  'spinner-shown': 'Bitcoin and Lightning spinner appeared',
  'spinner-cleared': 'Bitcoin and Lightning spinner disappeared',
  'electrum-verification': 'Preflight before node creation (estimated)',
  'node-restore': 'Bitcoin and Lightning node created',
  'initial-sync': 'Initial Bitcoin sync wait finished',
  'first-primary-connected': 'Lightning primary authenticated',
  'routing-graph-restored': 'Routing graph restore finished',
  'vault-writes': 'Cumulative vault write time during engine start',
  'first-channel-usable': 'Funded channel accepts payments',
  'engine-start': 'Engine start returned',
  'dashboard-connected': 'Dashboard verified Lightning',
  'first-lightning-review': 'Lightning payment review completed',
};

export function useWalletTimings(enabled: boolean) {
  const started = useRef<number | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const begin = () => {
    if (!enabled) return;
    started.current = performance.now();
    setReadings([{ phase: 'unlock', elapsedMs: 0 }]);
  };
  const record = useCallback((timing: Timing) => {
    if (started.current === null) return;
    const elapsedMs = Math.round(performance.now() - started.current);
    setReadings((previous) =>
      previous.some(({ phase }) => phase === timing.phase) ? previous : [...previous, { ...timing, elapsedMs }],
    );
  }, []);
  return { begin, record: enabled ? record : undefined, readings };
}

export function WalletTimings({ readings }: { readings: Reading[] }) {
  const [lastCopy, setLastCopy] = useState<{ report: string; ok: boolean } | null>(null);
  const report = readings
    .map(({ phase, elapsedMs, durationMs }) => {
      const span = durationMs === undefined ? '' : ` (${Math.round(durationMs)} ms in step)`;
      return `${elapsedMs} ms  ${labels[phase]}${span}`;
    })
    .join('\n');
  return (
    <section aria-label="Unlock timings" className="rounded-xl border border-border p-3 text-sm">
      <div className="flex items-start gap-3">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer py-1 font-medium">Unlock timings</summary>
          <p className="mt-2 text-muted-foreground">
            Times are measured from pressing Unlock. The report stays in this tab. Reviewing a Lightning invoice adds
            the quote time.
          </p>
          {report && <pre className="mt-2 text-xs whitespace-pre-wrap tabular-nums">{report}</pre>}
        </details>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!report}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(report);
              setLastCopy({ report, ok: true });
            } catch {
              setLastCopy({ report, ok: false });
            }
          }}
        >
          Copy timings
        </Button>
      </div>
      {lastCopy?.report === report && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          {lastCopy.ok ? 'Copied.' : 'Open Unlock timings and select the text to copy it.'}
        </p>
      )}
    </section>
  );
}
