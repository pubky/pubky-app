'use client';

import { useEffect, useState } from 'react';
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
  const [items, setItems] = useState<TUnlockedListItem[]>([]);
  // Not a plain `isLoading`: waiting on the session restore is also loading, and reporting a settled
  // count of 0 there would flash a wrong number before the real one arrives.
  const [hasResolved, setHasResolved] = useState(false);
  const [isError, setIsError] = useState(false);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Reading my own `/priv` needs the restored session; `currentUserPubky` is persisted and
  // rehydrates first, which would fire this before the session exists.
  const session = useAuthStore((state) => state.session);

  useEffect(() => {
    if (!enabled || !currentUserPubky || !session) {
      // Signing out or switching to someone else's profile must not leave my list on screen.
      setItems([]);
      setHasResolved(false);
      return;
    }

    let cancelled = false;
    setIsError(false);
    LocksController.fetchUnlockedList({ readerPubky: currentUserPubky })
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        // Already reported by the Err factory; `isError` lets the screen offer a retry.
        if (cancelled) return;
        setItems([]);
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setHasResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, currentUserPubky, session]);

  return { items, count: items.length, isLoading: enabled && !hasResolved, isError };
}
