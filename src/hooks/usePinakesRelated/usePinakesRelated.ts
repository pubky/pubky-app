'use client';

import { isPinakesConfigured, PINAKES_RELATED_LIMIT } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { usePinakesQuery } from '@/hooks/usePinakesQuery/usePinakesQuery';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

/**
 * "Similar": what the people who tagged a resource also referenced (`related=<id>`).
 *
 * Pass `null` until the viewer asks for it, so a feed render never spends Pinakes's budget on it
 * (a related search costs six requests of the per-IP budget). `data` is `[]` when there are none.
 *
 * @param id - Pinakes resource ID (`card.id`), or `null` to not read yet
 * @param limit - Results to ask for
 */
export function usePinakesRelated(
  id: string | null | undefined,
  limit: number = PINAKES_RELATED_LIMIT,
): UsePinakesQueryResult<TPinakesCard[]> {
  return usePinakesQuery({
    key: `${id ?? ''}:${limit}`,
    fetchFn: () => PinakesController.fetchRelated({ id: id!, limit }),
    enabled: Boolean(id) && isPinakesConfigured(),
  });
}
