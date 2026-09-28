'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
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
  // A pre-`/priv` session gets a 403 (an `Err.auth` sent to Sentry) instead of a listing (#2373).
  const needsUpgrade = useSessionNeedsUpgrade();

  useEffect(() => {
    if (!enabled || !currentUserPubky || !session) {
      // Signing out or switching to someone else's profile must not leave my list on screen.
      setItems([]);
      setHasResolved(false);
      setIsError(false);
      return;
    }

    // This session cannot read `/priv` at all, so skip the doomed request. The state of the read
    // itself is left alone and the block is reported through the returned values below: once the
    // session is replaced this effect runs again and the screen goes straight to loading, instead of
    // showing the error copy left behind by the block.
    if (needsUpgrade) {
      setItems([]);
      return;
    }

    let cancelled = false;
    LocksController.fetchUnlockedList({ readerPubky: currentUserPubky })
      .then((result) => {
        if (cancelled) return;
        setItems(result);
        // Cleared on success, not when the read starts: a retry of a failed read still holds the
        // emptied list, which would be reported as a settled count of 0 while it is in flight.
        setIsError(false);
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
  }, [enabled, currentUserPubky, session, needsUpgrade]);

  return {
    items,
    count: items.length,
    // A blocked session is settled, not loading — otherwise the sidebar spins on a count that cannot
    // arrive — and it is reported like a failed read, so the sidebar shows no number rather than a
    // confident 0. The Unlocked screen shows the permission notice instead of the error copy.
    isLoading: enabled && !needsUpgrade && !hasResolved,
    isError: needsUpgrade || isError,
  };
}
