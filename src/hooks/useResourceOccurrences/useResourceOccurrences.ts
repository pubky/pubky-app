'use client';

import { useEffect, useRef, useState } from 'react';
import { EVENT_DATES_PAGE_SIZE } from '@/config/events';
import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { isAppError } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
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
  /** Reads the first dates again, after `isError`. */
  retry: () => void;
}

type TRead = {
  id: string;
  /** The read it belongs to: one per time the resource is opened or read again. */
  key: string;
  cards: TPinakesCard[];
  cursor: string | null;
  isLoading: boolean;
  isError: boolean;
  isLoadingMore: boolean;
  isMoreError: boolean;
};

/** Pinakes refused the page (an expired cursor): the list starts over once. */
const isRefused = (error: unknown) => isAppError(error) && error.context?.statusCode === HttpStatusCode.BAD_REQUEST;

/**
 * A calendar's coming dates, page by page (`PinakesController.fetchOccurrences`): its instances
 * from now on, by start. Every page is asked in the window the first one opened (the same start),
 * since a cursor fits only the window it came from. A next page Pinakes refuses (its cursor
 * expired) starts the list over from a fresh first page, once per resource; refused again, the
 * error stands. A first page read again (the list started over, or `retry`) is asked past the
 * cache: within the minute the window is the same, and the cache would answer the page whose
 * cursor was refused. A resource that is no calendar has no dates.
 * The service reports a failed read; nothing is logged again here.
 *
 * @param id - Pinakes resource ID (`card.id`); `null` reads nothing
 */
export function useResourceOccurrences(id: string | null | undefined): UseResourceOccurrencesResult {
  const isEnabled = Boolean(id) && isPinakesConfigured();
  const [read, setRead] = useState<TRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The read going on now (one object per read: a page of an earlier read of the same resource is
  // told apart by it), where its window starts, and whether a next page is on its way
  const current = useRef<{ id: string; from: string; key: string } | null>(null);
  const isLoadingMore = useRef(false);
  const reads = useRef(0);
  // The resource whose list already started over after a refused cursor
  const restartedFor = useRef<string | null>(null);
  const lastId = useRef(id);
  // The resource whose first page is to be read again (its list started over, or `retry`): the
  // next read of that resource only
  const readAgainFor = useRef<string | null>(null);

  useEffect(() => {
    const isReadAgain = Boolean(id) && readAgainFor.current === id;
    readAgainFor.current = null;
    // Another resource may start over once again
    if (lastId.current !== id) {
      lastId.current = id;
      restartedFor.current = null;
    }
    if (!isEnabled || !id) return;
    const from = getOccurrencesWindowStart(new Date());
    reads.current += 1;
    const window = { id, from, key: `${id}:${reads.current}` };
    current.current = window;
    isLoadingMore.current = false;
    setRead(null);
    const settle = (page: Pick<TRead, 'cards' | 'cursor' | 'isError'>) => {
      if (current.current !== window) return;
      setRead({ id, key: window.key, ...page, isLoading: false, isLoadingMore: false, isMoreError: false });
    };
    PinakesController.fetchOccurrences({
      id,
      limit: EVENT_DATES_PAGE_SIZE,
      from,
      // Past the cache, which may hold this window's first page with the cursor that was refused
      ...(isReadAgain ? { fresh: true } : {}),
    }).then(
      (page) => settle({ cards: mergeResourceInstances([], page.cards), cursor: page.cursor, isError: false }),
      () => settle({ cards: [], cursor: null, isError: true }),
    );
    return () => {
      if (current.current === window) current.current = null;
    };
  }, [id, isEnabled, attempt]);

  // Each new read starts from nothing (`setRead(null)` above), so what is held for this resource is
  // this read's
  const shown = isEnabled && read?.id === id ? read : null;

  async function loadMore() {
    const window = current.current;
    if (!shown?.cursor || !window || isLoadingMore.current) return;
    const { id: readId, from, key } = window;
    // Only the read this page was asked in: its cursor fits no other window
    const patch = (next: (prev: TRead) => TRead) => setRead((prev) => (prev?.key === key ? next(prev) : prev));
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
    } catch (error) {
      if (isRefused(error) && restartedFor.current !== readId && current.current === window) {
        restartedFor.current = readId;
        readAgainFor.current = readId;
        setAttempt((count) => count + 1);
        return;
      }
      patch((prev) => ({ ...prev, isLoadingMore: false, isMoreError: true }));
    } finally {
      if (current.current === window) isLoadingMore.current = false;
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
    retry: () => {
      restartedFor.current = null;
      readAgainFor.current = id ?? null;
      setAttempt((count) => count + 1);
    },
  };
}
