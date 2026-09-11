'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UsePurchasedLocksParams, UsePurchasedLocksResult } from './usePurchasedLocks.types';

/**
 * One listing per reader per page load, shared by every lock post on screen. Without it each card
 * would ask the homeserver whether it has been paid for, which is a request per post in the feed.
 *
 * Keyed by reader so signing in as someone else cannot inherit the previous reader's answers.
 */
let purchasedIdsByReader: { readerPubky: string; ids: Promise<Set<string>> } | null = null;

function loadPurchasedIds(readerPubky: string): Promise<Set<string>> {
  if (purchasedIdsByReader?.readerPubky !== readerPubky) {
    const ids: Promise<Set<string>> = LocksController.fetchPurchasedLockIds({ readerPubky })
      .then((loaded) => new Set(loaded))
      // Already reported by the Err factory. Degrade rather than block rendering: the unlock
      // modal re-reads the saved bundle id itself before it ever offers to pay.
      .catch(() => {
        // Let the next mount try again, unless markPurchased already chained onto this listing.
        if (purchasedIdsByReader?.ids === ids) purchasedIdsByReader = null;
        return new Set<string>();
      });
    purchasedIdsByReader = { readerPubky, ids };
  }
  return purchasedIdsByReader.ids;
}

/** Which locks the signed-in reader has already paid for. */
export function usePurchasedLocks({ enabled }: UsePurchasedLocksParams): UsePurchasedLocksResult {
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  // `currentUserPubky` is persisted and rehydrates before the session is rebuilt. Listing without
  // one reads `/priv` unauthenticated, and its 404 would cache "nothing purchased" for the whole
  // page load — silently disabling the paid-but-never-received recovery.
  const session = useAuthStore((state) => state.session);
  const [ids, setIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || !readerPubky || !session) {
      setIds(null);
      return;
    }
    let cancelled = false;
    void loadPurchasedIds(readerPubky).then((loaded) => {
      if (!cancelled) setIds(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, readerPubky, session]);

  const hasPurchase = (lockId: string | null) => Boolean(lockId && ids?.has(lockId));

  /**
   * The listing was taken before this purchase existed, so without recording it the reader would
   * have to reload before the recovery path could see it. Chained onto the cached promise rather
   * than replacing it: a listing still in flight would otherwise land afterwards and drop this id
   * for every card on the page. A new Set is stored because mutating the cached one changes
   * nothing on screen.
   */
  const markPurchased = (lockId: string) => {
    // A null purchasedIdsByReader means the listing failed; the purchase still has to be recorded, or the
    // recovery path cannot pick it up after the modal closes.
    if (!readerPubky || (purchasedIdsByReader && purchasedIdsByReader.readerPubky !== readerPubky)) return;
    const merged = (purchasedIdsByReader?.ids ?? Promise.resolve(new Set<string>())).then((loaded) =>
      new Set(loaded).add(lockId),
    );
    purchasedIdsByReader = { readerPubky, ids: merged };
    void merged.then(setIds);
  };

  return { hasPurchase, markPurchased };
}
