'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import type { TFetchLockFileResult } from '@/services/locks/locks.types';
import type { UseLockFileResult } from './useLockFile.types';

/** Reads the immutable descriptor once per URL; a live query would re-run when the row's post changes. */
export function useLockFile(lockUrl: string | null | undefined): UseLockFileResult {
  const [entry, setEntry] = useState<{ url: string; result: TFetchLockFileResult | null } | null>(null);
  useEffect(() => {
    setEntry(null);
    if (!lockUrl) return;

    let cancelled = false;
    LocksController.getOrFetchLockFile({ lockUrl })
      .then((result) => {
        if (!cancelled) setEntry({ url: lockUrl, result });
      })
      // Settle on failure so the card stops spinning; the Err.* factory already captured it.
      .catch(() => {
        if (!cancelled) setEntry({ url: lockUrl, result: null });
      });

    return () => {
      cancelled = true;
    };
  }, [lockUrl]);

  const isSettled = entry !== null && entry.url === lockUrl;
  const result = isSettled ? entry.result : null;
  return {
    lockFile: result?.lockFile ?? null,
    priceSats: result?.priceSats ?? null,
    isLoading: Boolean(lockUrl) && !isSettled,
  };
}
