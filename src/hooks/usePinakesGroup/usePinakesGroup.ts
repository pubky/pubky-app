'use client';

import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { usePinakesQuery } from '@/hooks/usePinakesQuery/usePinakesQuery';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import type { TPinakesGroupDetail } from '@/services/pinakes/pinakes.types';

/**
 * A Pinakes group: the same thing on several services, every member with its own card.
 *
 * `data` is `null` when the group no longer exists (404), Pinakes is not configured, or `id` is
 * empty (the card has no `group`).
 *
 * @param id - Group ID (`card.group.id`)
 */
export function usePinakesGroup(id: string | null | undefined): UsePinakesQueryResult<TPinakesGroupDetail> {
  return usePinakesQuery({
    key: id ?? '',
    fetchFn: () => PinakesController.fetchGroup({ id: id! }),
    enabled: Boolean(id) && isPinakesConfigured(),
  });
}
