'use client';

import { useEffect, useState } from 'react';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { getResourceInstanceKey, type TEventInstance, toEventInstance } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

/**
 * The rows of an event search as events to list (`PinakesController.fetchEventInstances`): each
 * with the details read for it (time zone, venue, status), each calendar occurrence as its own
 * event. One per row, in the rows' order, shown once the details of every row before it are read,
 * so a list grouped by day never moves an event to another day after showing it. Rows that come
 * later (the next page) are read on their own; the events already shown stay. When details cannot
 * be read, the rows show as the search gave them.
 *
 * @param cards - The search's rows (`useResourceSearch` with `cards`)
 */
export function useEventInstances(cards: readonly TPinakesCard[]): { instances: TEventInstance[]; isLoading: boolean } {
  const [read, setRead] = useState<ReadonlyMap<string, TEventInstance>>(new Map());
  const keys = cards.map(getResourceInstanceKey);
  const keysText = JSON.stringify(keys);

  useEffect(() => {
    const pending = cards.filter((card) => !read.has(getResourceInstanceKey(card)));
    if (pending.length === 0) return;
    let cancelled = false;
    const keep = (instances: readonly TEventInstance[]) => {
      if (cancelled) return;
      setRead((prev) => new Map([...prev, ...instances.map((one) => [getResourceInstanceKey(one), one] as const)]));
    };
    PinakesController.fetchEventInstances({ cards: pending }).then(keep, () =>
      // The failure is reported by its factory; the rows show without details
      keep(pending.map((card) => toEventInstance(card, null))),
    );
    return () => {
      cancelled = true;
    };
    // `keysText` spells the rows; what is read for them is kept, so a read never repeats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysText]);

  const instances: TEventInstance[] = [];
  for (const key of keys) {
    const instance = read.get(key);
    // In order only: an event is not shown before the ones listed above it
    if (!instance) break;
    instances.push(instance);
  }
  return { instances, isLoading: instances.length < keys.length };
}
