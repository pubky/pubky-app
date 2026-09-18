'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LocksController } from '@/controllers/locks/locks';
import type { TUnlockedListItem } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseUnlockedListParams, UseUnlockedListResult } from './useUnlockedList.types';

/**
 * The signed-in user's unlocked content. Read once per profile visit from
 * `ProfilePageContainer` — that layout survives tab navigation, so the sidebar count and the
 * Unlocked screen share the single instance rather than enumerating twice.
 */
export function useUnlockedList({ enabled = true }: UseUnlockedListParams = {}): UseUnlockedListResult {
  const [remote, setRemote] = useState<{ account: string; items: TUnlockedListItem[] } | null>(null);
  const [isHomeserverListFetchFinished, setIsHomeserverListFetchFinished] = useState(false);
  const [isError, setIsError] = useState(false);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Reading my own `/priv` needs the restored session; `currentUserPubky` is persisted and
  // rehydrates first, which would fire this before the session exists.
  const session = useAuthStore((state) => state.session);
  // A session or account change must hide the previous reader's list immediately.
  const active = enabled && !!currentUserPubky && !!session;
  const local = useLiveQuery(
    () => (active ? LocksController.getUnlockedList().catch(() => []) : Promise.resolve([])),
    [active, currentUserPubky],
  );

  useEffect(() => {
    if (!enabled || !currentUserPubky || !session) {
      setIsError(false);
      setIsHomeserverListFetchFinished(false);
      return;
    }

    let cancelled = false;
    setIsError(false);
    setIsHomeserverListFetchFinished(false);
    LocksController.fetchUnlockedList({ readerPubky: currentUserPubky })
      .then((result) => {
        if (!cancelled) setRemote({ account: currentUserPubky, items: result });
      })
      .catch(() => {
        // Already reported by the Err factory; `isError` lets the screen offer a retry.
        if (cancelled) return;
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsHomeserverListFetchFinished(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, currentUserPubky, session]);

  const remoteItems = remote?.account === currentUserPubky ? remote.items : [];
  const byId = new Map<string, TUnlockedListItem>();
  if (active) {
    for (const item of local ?? []) byId.set(item.lockId, item);
    for (const item of remoteItems) byId.set(item.lockId, item);
  }
  const items = [...byId.values()].sort((a, b) => b.unlockedAt - a.unlockedAt);
  return {
    items,
    count: items.length,
    // An empty local cache does not prove that another device has no unlocks yet.
    isLoading: enabled && (!session || local === undefined || (items.length === 0 && !isHomeserverListFetchFinished)),
    isError,
  };
}
