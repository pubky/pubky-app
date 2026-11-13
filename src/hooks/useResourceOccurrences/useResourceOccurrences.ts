'use client';

import { useEffect, useRef, useState } from 'react';
import { EVENT_DATES_PAGE_SIZE } from '@/config/events';
import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { getOccurrencesWindowStart, mergeResourceInstances } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

export interface UseResourceOccurrencesResult {
  /** The dates read so far, by start: one card per instance of the calendar. */
  cards: TPinakesCard[];
  /** The first dates are being read. */
  isLoading: boolean;
  /** The first dates could not be read. */
  isError: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** The next dates could not be read: the ones read stay, and `loadMore` asks again. */
  isMoreError: boolean;
  loadMore: () => Promise<void>;
}

type TRead = {
  id: string;
  cards: TPinakesCard[];
  cursor: string | null;
  isLoading: boolean;
  isError: boolean;
  isLoadingMore: boolean;
  isMoreError: boolean;
};

/**
 * A calendar's coming dates, page by page (`PinakesController.fetchOccurrences`): its instances
 * from now on, by start. Every page is asked in the window the first one opened (the same start),
 * since a cursor fits only the window it came from. A resource that is no calendar has no dates.
 * The service reports a failed read; nothing is logged again here.
 *
 * @param id - Pinakes resource ID (`card.id`); `null` reads nothing
 */
export function useResourceOccurrences(id: string | null | undefined): UseResourceOccurrencesResult {
  const isEnabled = Boolean(id) && isPinakesConfigured();
  const [read, setRead] = useState<TRead | null>(null);
  // The resource being read now, where its window starts, and whether a next page is on its way
  const current = useRef<{ id: string; from: string } | null>(null);
  const isLoadingMore = useRef(false);

  useEffect(() => {
    if (!isEnabled || !id) return;
    const from = getOccurrencesWindowStart(new Date());
    current.current = { id, from };
    isLoadingMore.current = false;
    const settle = (page: Pick<TRead, 'cards' | 'cursor' | 'isError'>) => {
      if (current.current?.id !== id) return;
      setRead({ id, ...page, isLoading: false, isLoadingMore: false, isMoreError: false });
    };
    PinakesController.fetchOccurrences({ id, limit: EVENT_DATES_PAGE_SIZE, from }).then(
      (page) => settle({ cards: mergeResourceInstances([], page.cards), cursor: page.cursor, isError: false }),
      () => settle({ cards: [], cursor: null, isError: true }),
    );
    return () => {
      current.current = null;
    };
  }, [id, isEnabled]);

  const shown = isEnabled && read?.id === id ? read : null;

  async function loadMore() {
    const window = current.current;
    if (!shown?.cursor || !window || isLoadingMore.current) return;
    const { id: readId, from } = window;
    const patch = (next: (prev: TRead) => TRead) => setRead((prev) => (prev?.id === readId ? next(prev) : prev));
    isLoadingMore.current = true;
    patch((prev) => ({ ...prev, isLoadingMore: true, isMoreError: false }));
    try {
      const page = await PinakesController.fetchOccurrences({
        id: readId,
        limit: EVENT_DATES_PAGE_SIZE,
        from,
        cursor: shown.cursor,
      });
      patch((prev) => ({
        ...prev,
        cards: mergeResourceInstances(prev.cards, page.cards),
        cursor: page.cursor,
        isLoadingMore: false,
      }));
    } catch {
      patch((prev) => ({ ...prev, isLoadingMore: false, isMoreError: true }));
    } finally {
      if (current.current?.id === readId) isLoadingMore.current = false;
    }
  }

  return {
    cards: shown?.cards ?? [],
    isLoading: isEnabled && shown === null,
    isError: shown?.isError ?? false,
    hasMore: Boolean(shown?.cursor),
    isLoadingMore: shown?.isLoadingMore ?? false,
    isMoreError: shown?.isMoreError ?? false,
    loadMore,
  };
}
