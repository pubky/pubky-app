'use client';

import { useEffect, useRef, useState } from 'react';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { getResourceInstanceKey, type TEventInstance, toEventInstance } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

/**
 * What a row says, whole. A row that comes again with the same id (`getResourceInstanceKey`) and
 * another start, place, name or status is another version of it: what was read for the earlier one
 * is not its own.
 */
const getRowVersion = (card: TPinakesCard) => JSON.stringify(card);

/**
 * The rows of an event search as events to list (`PinakesController.fetchEventInstances`): each
 * with the details read for it (time zone, venue, status), each calendar occurrence as its own
 * event. One per row, in the rows' order, shown once the details of every row before it are read,
 * so a list grouped by day never moves an event to another day after showing it. Rows that come
 * later (the next page) are read on their own, without a read in flight being thrown away; the
 * events already shown stay. What is read is kept for the row as it was read (`getRowVersion`),
 * and only while the list has that row: a row the search gives again with other contents, or a
 * list that comes again after another, is read again (through the cards' own cache) and shows only
 * the answer asked for it, whichever read answers last. When details cannot be read, the rows show
 * as the search gave them.
 *
 * @param cards - The search's rows (`useResourceSearch` with `cards`)
 */
export function useEventInstances(cards: readonly TPinakesCard[]): { instances: TEventInstance[]; isLoading: boolean } {
  // What is read, by the version of the row it was read for
  const [read, setRead] = useState<ReadonlyMap<string, TEventInstance>>(new Map());
  // The read each listed version is asked in (one object per read): each version once, however the
  // list grows meanwhile
  const asked = useRef(new Map<string, object>());
  const versions = cards.map(getRowVersion);
  const versionsText = JSON.stringify(versions);

  useEffect(() => {
    // A row the list no longer has is forgotten, with what was read for it and any read of it
    // still on its way: listed again, it is read again
    const listed = new Set(versions);
    const gone = [...asked.current.keys()].filter((version) => !listed.has(version));
    if (gone.length > 0) {
      for (const version of gone) asked.current.delete(version);
      setRead((prev) => new Map([...prev].filter(([version]) => listed.has(version))));
    }
    const pending = cards.filter((_, index) => !asked.current.has(versions[index]));
    if (pending.length === 0) return;
    const ask = {};
    // An answer is its row's by the row's key, and kept under the version that was asked for
    const versionByKey = new Map(pending.map((card) => [getResourceInstanceKey(card), getRowVersion(card)]));
    for (const version of versionByKey.values()) asked.current.set(version, ask);
    // No cleanup: a next page leaves this read on its way. Its answer counts for the rows still
    // asked in it, and is shown only for the rows the list has now
    const keep = (instances: readonly TEventInstance[]) => {
      const own = instances.flatMap((one) => {
        const version = versionByKey.get(getResourceInstanceKey(one));
        return version !== undefined && asked.current.get(version) === ask ? [[version, one] as const] : [];
      });
      if (own.length > 0) setRead((prev) => new Map([...prev, ...own]));
    };
    PinakesController.fetchEventInstances({ cards: pending }).then(keep, () =>
      // The failure is reported by its factory; the rows show without details
      keep(pending.map((card) => toEventInstance(card, null))),
    );
    // `versionsText` spells the rows; what is read for them is kept, so a read never repeats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionsText]);

  const instances: TEventInstance[] = [];
  for (const version of versions) {
    const instance = read.get(version);
    // In order only: an event is not shown before the ones listed above it
    if (!instance) break;
    instances.push(instance);
  }
  return { instances, isLoading: instances.length < versions.length };
}
