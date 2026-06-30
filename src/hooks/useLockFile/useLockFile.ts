'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile } from '@/services/locks/locks.types';
import type { UseLockFileResult } from './useLockFile.types';

/**
 * Fetch a lock post's public lock file (`lock.json`) from its top-level `lock` URL.
 *
 * Network-only, so it uses `useEffect` + state rather than `useLocalFirstQuery`
 * (no local cache to read). Failures never block the user —
 * the fetch is caught and surfaced as `hasError` for an "unavailable" UI.
 *
 * @param lockUrl - The post's `lock` URL, or null/undefined to skip.
 */
export function useLockFile(lockUrl: string | null | undefined): UseLockFileResult {
  const [lockFile, setLockFile] = useState<LockFile | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setLockFile(null);
    setHasError(false);

    if (!lockUrl) return;

    let cancelled = false;

    LocksController.fetchLockFile({ lockUrl })
      .then((file) => {
        if (!cancelled) setLockFile(file);
      })
      .catch(() => {
        // The AppError was already logged + captured to Sentry by the Err.* factory
        // that threw it — don't re-log (avoids double logging). Just degrade the UI.
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lockUrl]);

  return { lockFile, hasError };
}
