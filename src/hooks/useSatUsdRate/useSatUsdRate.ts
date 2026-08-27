'use client';

import { useEffect, useState } from 'react';
import type { BtcRate } from '@/services/exchangerate/exchangerate.types';

export type TBtcRateResult = { rate: BtcRate | null; status: 'loading' | 'ready' | 'failed' };

/**
 * Fetch the current SAT/USD exchange rate. Cached for a minute at the service layer.
 *
 * `status` separates "still loading" from "gave up", so a caller can stay quiet until the rate
 * either arrives or fails rather than flashing an error while the request is in flight.
 *
 * @example
 * ```tsx
 * const { rate, status } = useBtcRate();
 * if (status === 'failed') return <div>Rate not available</div>;
 * if (rate) return <div>{sats} SAT = ${sats * rate.satUsd}</div>;
 * ```
 */
export function useBtcRate(): TBtcRateResult {
  const [result, setResult] = useState<TBtcRateResult>({ rate: null, status: 'loading' });

  useEffect(() => {
    // Avoid fetching on server to prevent hydration errors
    if (typeof window === 'undefined') return;

    // Through our own route, not the rate API directly: the upstream sends no CORS header.
    fetch('/api/btc-rate')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((json) => setResult({ rate: { ...json, lastUpdatedAt: new Date(json.lastUpdatedAt) }, status: 'ready' }))
      .catch(() => setResult({ rate: null, status: 'failed' }));
  }, []);

  return result;
}
