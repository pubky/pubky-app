'use client';

import { useEffect } from 'react';
import { getRegionPolicy } from '@/config/region';
import { ClientRegionController } from '@/controllers/client-region/client-region';
import {
  type ClientRegionState,
  evaluatePaidUnlockAvailability,
  PAID_UNLOCKS_AVAILABLE,
  type PaidUnlockAvailability,
} from '@/libs/region/paidUnlockAvailability';
import { useClientRegionStore } from '@/stores/clientRegion/clientRegion.store';

/**
 * Whether paid unlocks are offered where the viewer is, for the pay action and the composer's lock switch, so a
 * blocked viewer hears it before trying instead of at the payment step.
 *
 * It asks the Shop's region route once per page load, and only when the deployment lists a region
 * (`PUBKY_RUNTIME_REGION_MODES`). With none listed it is `available` and makes no request, so free content
 * and every other feature never read the viewer's region. It is advisory: the Lock Server's 451 still lands
 * on its own state if this check was wrong or could not run.
 */
export function usePaidUnlockAvailability(): PaidUnlockAvailability {
  const policy = getRegionPolicy();
  const holdsPaidUnlocks = policy.holdsPaidUnlocks;
  const status = useClientRegionStore((state) => state.status);
  const country = useClientRegionStore((state) => state.country);

  useEffect(() => {
    if (holdsPaidUnlocks) void ClientRegionController.fetchCountryOnce();
  }, [holdsPaidUnlocks]);

  if (!holdsPaidUnlocks) return PAID_UNLOCKS_AVAILABLE;
  const client: ClientRegionState =
    status === 'ready' ? { status, country } : status === 'failed' ? { status } : { status: 'loading' };
  return evaluatePaidUnlockAvailability(policy, client);
}
