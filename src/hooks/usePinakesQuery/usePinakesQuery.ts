'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { UsePinakesQueryParams, UsePinakesQueryResult } from './usePinakesQuery.types';

/** The answer for `key`; `rechecks` counts the re-reads made since (`recheck`). */
type TSettled<T> = { key: string; data: T | null; isError: boolean; rechecks: number };

/**
 * Network-only read of Pinakes for a component (ADR-0011: controller + TanStack Query + effect).
 *
 * Pinakes cards are not stored in IndexedDB, so this is not `useLocalFirstQuery`: the controller's
 * service caches and deduplicates through `pinakesQueryClient`, and this hook only tracks the
 * answer for the current key. A disabled read (no input, Pinakes not configured, not opened yet)
 * makes no request and reads as settled `null`.
 *
 * With `recheck`, an answer that may still change (a link Pinakes is about to read) is read again
 * after `recheck.delay` while `recheck.active`; the answer shown stays until the next one arrives,
 * so the caller never falls back to a loading state. A failed re-read keeps it too.
 */
export function usePinakesQuery<T>({
  key,
  fetchFn,
  enabled,
  recheck,
}: UsePinakesQueryParams<T>): UsePinakesQueryResult<T> {
  const [settled, setSettled] = useState<TSettled<T> | null>(null);
  const runFetch = useEffectEvent(fetchFn);
  const runRecheck = useEffectEvent(() => (recheck?.fetchFn ?? fetchFn)());

  useEffect(() => {
    if (!enabled) return;

    // Set by the cleanup when the key changes or the component unmounts, so an answer that lost
    // the race never replaces a newer one.
    let cancelled = false;
    runFetch().then(
      (data) => {
        if (!cancelled) setSettled({ key, data, isError: false, rechecks: 0 });
      },
      () => {
        // The service already reported the failure through Err.*; a card is optional, so the
        // caller shows its error or fallback state and nothing is logged again here.
        if (!cancelled) setSettled({ key, data: null, isError: true, rechecks: 0 });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  const current = enabled && settled?.key === key ? settled : null;
  const rechecks = current?.rechecks ?? 0;
  const delay = current && !current.isError && recheck?.active ? recheck.delay(current.data, rechecks) : null;

  useEffect(() => {
    if (delay === null) return;
    let cancelled = false;
    const next = rechecks + 1;
    const timer = setTimeout(() => {
      runRecheck().then(
        (data) => {
          if (!cancelled) setSettled({ key, data, isError: false, rechecks: next });
        },
        () => {
          if (!cancelled) setSettled((prev) => (prev?.key === key ? { ...prev, rechecks: next } : prev));
        },
      );
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, delay, rechecks]);

  if (!enabled) return { data: null, isLoading: false, isError: false };
  if (!current) return { data: undefined, isLoading: true, isError: false };

  return { data: current.data, isLoading: false, isError: current.isError };
}
