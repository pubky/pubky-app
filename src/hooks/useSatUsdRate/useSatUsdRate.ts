'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Logger } from '@/libs/logger/logger';
import type { BtcRate } from '@/services/exchangerate/exchangerate.types';

type TBtcRateResult = { rate: BtcRate | null; status: 'loading' | 'ready' | 'failed' };

// The route can answer 200 with something that is not a rate — a proxy error page, or a field
// renamed on the server. Without this schema such a body reaches the UI as `satUsd: undefined`,
// and the price line shows `$NaN` instead of saying the dollar value is unavailable.
export const btcRateSchema = z.object({
  satUsd: z.number().positive(),
  btcUsd: z.number().positive(),
  // Only a string or a number reaches the coercion — `new Date(null)` would otherwise pass as 1970.
  lastUpdatedAt: z.union([z.string(), z.number()]).pipe(z.coerce.date()),
});

/**
 * Fetch the current SAT/USD exchange rate. Cached for a minute at the service layer.
 *
 * `status` separates "still loading" from "gave up", so a caller can stay quiet until the rate
 * either arrives or fails rather than flashing an error while the request is in flight.
 *
 * @param enabled - Pass false to hold the request back until the rate is actually on screen.
 *
 * @example
 * ```tsx
 * const { rate, status } = useBtcRate();
 * if (status === 'failed') return <div>Rate not available</div>;
 * if (rate) return <div>{sats} SAT = ${sats * rate.satUsd}</div>;
 * ```
 */
export function useBtcRate(enabled = true): TBtcRateResult {
  const [result, setResult] = useState<TBtcRateResult>({ rate: null, status: 'loading' });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // The hook outlives a closed dialog, so without this a retry would show the old error for as
    // long as it is in flight. A rate that did arrive stays on screen instead of blanking.
    setResult((prev) => (prev.status === 'failed' ? { rate: null, status: 'loading' } : prev));

    // Through our own route, not the rate API directly: the upstream sends no CORS header.
    fetch('/api/btc-rate')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((json): TBtcRateResult => {
        const parsed = btcRateSchema.safeParse(json);
        if (parsed.success) return { rate: parsed.data, status: 'ready' };

        // A 2xx that is not a rate is a server-side change, not a user's bad network — the UI says
        // the same "unavailable" either way, so this log is the only place it surfaces.
        Logger.error('[useBtcRate] Unexpected /api/btc-rate response shape', parsed.error);
        return { rate: null, status: 'failed' };
      })
      .catch((): TBtcRateResult => ({ rate: null, status: 'failed' }))
      .then((next) => {
        if (!cancelled) setResult(next);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return result;
}
