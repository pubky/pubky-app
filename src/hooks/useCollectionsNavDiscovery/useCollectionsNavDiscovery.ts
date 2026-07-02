'use client';

import { useEffect, useState } from 'react';
import {
  buildFeatureDiscoveryStorageKey,
  COLLECTIONS_NAV_NEW_BADGE_ENABLED,
  COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID,
} from '@/config/featureDiscovery';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useCollectionsNavDiscovery() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [seenState, setSeenState] = useState<{ pubky: string | null; seen: boolean }>({ pubky: null, seen: true });

  useEffect(() => {
    if (!COLLECTIONS_NAV_NEW_BADGE_ENABLED || !currentUserPubky) {
      setSeenState({ pubky: currentUserPubky ?? null, seen: true });
      return;
    }

    try {
      const storageKey = buildFeatureDiscoveryStorageKey(currentUserPubky, COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID);
      setSeenState({ pubky: currentUserPubky, seen: window.localStorage.getItem(storageKey) === 'seen' });
    } catch {
      setSeenState({ pubky: currentUserPubky, seen: true });
    }
  }, [currentUserPubky]);

  const showCollectionsNew =
    COLLECTIONS_NAV_NEW_BADGE_ENABLED &&
    Boolean(currentUserPubky) &&
    seenState.pubky === currentUserPubky &&
    !seenState.seen;

  const markCollectionsNavSeen = () => {
    if (!showCollectionsNew) return;
    setSeenState({ pubky: currentUserPubky, seen: true });

    try {
      const storageKey = buildFeatureDiscoveryStorageKey(
        currentUserPubky as string,
        COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID,
      );
      window.localStorage.setItem(storageKey, 'seen');
    } catch {
      // The in-memory state already hides the badge for this render session.
    }
  };

  return {
    showCollectionsNew,
    markCollectionsNavSeen,
  };
}
