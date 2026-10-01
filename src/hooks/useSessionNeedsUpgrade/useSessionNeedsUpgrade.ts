'use client';

import { sessionNeedsUpgrade } from '@/libs/capabilities/capabilities';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Whether the signed-in session lacks capabilities the app requests today (#2373). */
export function useSessionNeedsUpgrade(): boolean {
  return useAuthStore((state) => sessionNeedsUpgrade(state.session));
}
