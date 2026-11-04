'use client';

import { useEffect } from 'react';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { selectAccountUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH } from '@/stores/home/home.types';

const DEFAULT_NETWORK_MIN_FOLLOWING = 3;

export function useDefaultHomeReach(): void {
  // The onboarding key step stores a generated pubky before sign-up; it has no counts on Nexus (#2955).
  const currentUserPubky = useAuthStore(selectAccountUserPubky);
  const authHasHydrated = useAuthStore((state) => state.hasHydrated);
  const homeHasHydrated = useHomeStore((state) => state.hasHydrated);
  const reach = useHomeStore((state) => state.reach);
  const taggedAsActive = useHomeStore((state) => state.taggedAsActive);
  const hasUserSetReach = useHomeStore((state) => state.hasUserSetReach);
  const applyDefaultReach = useHomeStore((state) => state.applyDefaultReach);
  const canLoadCounts =
    authHasHydrated &&
    homeHasHydrated &&
    Boolean(currentUserPubky) &&
    !hasUserSetReach &&
    !taggedAsActive &&
    reach === REACH.ALL;
  const { stats, isLoading } = useProfileStats(currentUserPubky ?? '', { enabled: canLoadCounts });

  useEffect(() => {
    if (!canLoadCounts || isLoading || stats.following < DEFAULT_NETWORK_MIN_FOLLOWING) {
      return;
    }

    applyDefaultReach(REACH.NETWORK);
  }, [applyDefaultReach, canLoadCounts, isLoading, stats.following]);
}
