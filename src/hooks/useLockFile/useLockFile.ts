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
 * TODO:[Locks] #2296 — persist lock files to idb and read local-first (`useLocalFirstQuery`, ADR-0011).
 * A lock file is effectively immutable (its `lock_id` is a content hash), so a cached copy never goes
 * stale. Today every mount re-requests it through the SDK — the homeserver's ETag keeps that a cheap
 * 304 (no body re-download), but idb would skip the request (and the SDK call) entirely.
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
      // `verifierType` is dropped until the payment verifier UI needs it (see `LockedPostCard`).
      .then((result) => {
        if (!cancelled) setLockFile(result.lockFile);
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
