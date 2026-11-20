'use client';

import { useEffect, useState } from 'react';

/**
 * `true` once the read of `key` has taken longer than `ms`, and from then on while `key` stays: the
 * link's own preview stands in for the skeleton until the card is read. Another `key` (the
 * composer's link changes) starts over.
 */
export function useSlowRead(key: string | null, isLoading: boolean, ms: number): boolean {
  const [slowKey, setSlowKey] = useState<string | null>(null);
  const slow = key !== null && slowKey === key;
  useEffect(() => {
    if (key === null || !isLoading || slow) return;
    const timer = setTimeout(() => setSlowKey(key), ms);
    return () => clearTimeout(timer);
  }, [key, isLoading, slow, ms]);
  return slow;
}
