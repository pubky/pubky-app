'use client';

import { useEffect, useState } from 'react';
import { HomegateController } from '@/controllers/homegate/homegate';
import type { BtcRate } from '@/services/exchangerate/exchangerate.types';

/**
 * Fetch the current SAT/USD exchange rate.
 * The rate is cached at the service layer for 30 minutes.
 *
 * @returns The current SAT/USD rate, or null if the rate is not available
 *
 * @example
 * ```tsx
 * const rate = useBtcRate();
 * if (rate === null) return <div>Rate not available</div>;
 *
 * const sats = 1000;
 * const usd = sats * rate.satUsd;
 * return <div>{sats} SAT = ${usd}</div>;
 * ```
 */
export function useBtcRate(): BtcRate | null {
  const [rate, setRate] = useState<BtcRate | null>(null);

  useEffect(() => {
    // Avoid fetching on server to prevent hydration errors
    if (typeof window === 'undefined') return;

    HomegateController.getBtcRate()
      .then(setRate)
      .catch(() => setRate(null));
  }, []);

  return rate;
}
