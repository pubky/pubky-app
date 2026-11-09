'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UsePurchasedLocksParams, UsePurchasedLocksResult } from './usePurchasedLocks.types';

/**
 * One listing per reader per page load, shared by every lock post on screen. Without it each card
 * would ask the homeserver whether it has been paid for, which is a request per post in the feed.
 *
 * Keyed by reader and session so restoring another session cannot inherit an earlier answer.
 */
type PurchaseListing = { ids: Set<string>; failed: boolean };
type ReaderSession = NonNullable<ReturnType<typeof useAuthStore.getState>['session']>;
let purchasedIdsByReader: { readerPubky: string; session: ReaderSession; listing: Promise<PurchaseListing> } | null =
  null;

function loadPurchasedIds(readerPubky: string, session: ReaderSession): Promise<PurchaseListing> {
  if (purchasedIdsByReader?.readerPubky !== readerPubky || purchasedIdsByReader.session !== session) {
    const listing: Promise<PurchaseListing> = LocksController.fetchPurchasedLockIds({ readerPubky })
      .then((loaded) => ({ ids: new Set(loaded), failed: false }))
      // Already reported by the Err factory. Degrade rather than block rendering: the unlock
      // modal re-reads the saved bundle id itself before it ever offers to pay.
      .catch(() => {
        // Let the next mount try again, unless markPurchased already chained onto this listing.
        if (purchasedIdsByReader?.listing === listing) purchasedIdsByReader = null;
        return { ids: new Set<string>(), failed: true };
      });
    purchasedIdsByReader = { readerPubky, session, listing };
  }
  return purchasedIdsByReader.listing;
}

/** Which locks have a saved bundle id; their server tasks can still be absent or ended. */
export function usePurchasedLocks({ enabled }: UsePurchasedLocksParams): UsePurchasedLocksResult {
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  // `currentUserPubky` is persisted and rehydrates before the session is rebuilt. Listing without
  // one reads `/priv` unauthenticated, and its 404 would cache "nothing purchased" for the whole
  // page load — silently disabling the paid-but-never-received recovery.
  const session = useAuthStore((state) => state.session);
  // A pre-`/priv` session gets a 403 (an `Err.auth` sent to Sentry) instead of a listing (#2373).
  const needsUpgrade = useSessionNeedsUpgrade();
  const [loaded, setLoaded] = useState<{
    readerPubky: string;
    session: ReaderSession;
    listing: PurchaseListing;
  } | null>(null);
  const canRead = enabled && Boolean(readerPubky && session) && !needsUpgrade;
  // Hide another session's answer during render, before effect cleanup has had a chance to run.
  const listing = canRead && loaded?.readerPubky === readerPubky && loaded.session === session ? loaded.listing : null;

  useEffect(() => {
    if (!enabled || !readerPubky || !session || needsUpgrade) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    void loadPurchasedIds(readerPubky, session).then((listing) => {
      if (!cancelled) setLoaded({ readerPubky, session, listing });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, readerPubky, session, needsUpgrade]);

  const hasPurchase = (lockId: string | null) => Boolean(lockId && listing?.ids.has(lockId));

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
    if (!readerPubky || !session) return;
    const current = useAuthStore.getState();
    if (current.currentUserPubky !== readerPubky || current.session !== session) return;
    const cached = purchasedIdsByReader;
    if (cached && (cached.readerPubky !== readerPubky || cached.session !== session)) return;
    const merged = (cached?.listing ?? Promise.resolve({ ids: new Set<string>(), failed: true })).then((listing) => ({
      ...listing,
      ids: new Set(listing.ids).add(lockId),
    }));
    purchasedIdsByReader = { readerPubky, session, listing: merged };
    void merged.then((listing) => {
      const current = useAuthStore.getState();
      if (current.currentUserPubky === readerPubky && current.session === session) {
        setLoaded({ readerPubky, session, listing });
      }
    });
  };

  return {
    hasPurchase,
    markPurchased,
    status: !canRead ? 'idle' : !listing ? 'loading' : listing.failed ? 'error' : 'ready',
  };
}
