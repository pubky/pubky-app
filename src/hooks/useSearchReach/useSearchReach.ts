'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useAuthStore } from '@/stores/auth/auth.store';
import { REACH } from '@/stores/home/home.types';
import { useSearchStore } from '@/stores/search/search.store';
import type { SearchReach } from '@/stores/search/search.types';
import { getSearchNexusReach } from '@/stores/search/search.utils';

/** One Search selection for filters, result streams and the empty-state action. */
export function useSearchReach() {
  const storedReach = useSearchStore((state) => state.reach);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { requireAuth } = useRequireAuth();
  const reach = currentUserPubky ? storedReach : REACH.ALL;

  const setReach = (nextReach: SearchReach) => {
    const apply = () => {
      if (useSearchStore.getState().reach === nextReach) return;
      useSearchStore.getState().setReach(nextReach);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    if (nextReach === REACH.ALL) apply();
    else requireAuth(apply);
  };

  return { reach, nexusReach: getSearchNexusReach(reach), currentUserPubky, setReach };
}
