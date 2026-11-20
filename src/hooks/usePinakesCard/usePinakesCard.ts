'use client';

import { useEffect, useState } from 'react';
import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { usePinakesQuery } from '@/hooks/usePinakesQuery/usePinakesQuery';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import { getRecheckDelay, isUnsettledCard } from '@/pipes/pinakes/pinakes.recheck';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** How long a link must stay as written before Pinakes is asked to read it (`resolve`). */
export const PINAKES_RESOLVE_DEBOUNCE_MS = 800;

export interface UsePinakesCardOptions {
  /**
   * Reads "no card" (404) and a `pending` card again, 2 s, 4 s, 8 s ... apart for about two minutes,
   * while `true` (the card is on screen): a link in a post that was just published is read by
   * Pinakes seconds later. The answer shown stays until a better one arrives. The schedule is the
   * link's, once per page load, shared by all its previews.
   *
   * Pass it only for a post indexed in the last few minutes: each unknown link costs up to eight
   * reads, and a feed of older posts would spend Pinakes' per-IP budget on links it will not read.
   */
  recheck?: boolean;
  /**
   * Asks Pinakes to read a link it does not know (`POST /v1/resolve`), once per link, after it has
   * stayed as written for `PINAKES_RESOLVE_DEBOUNCE_MS`: for a link being written into a post.
   */
  resolve?: boolean;
}

/**
 * One resolve per link at a time, its card kept for the page load: Pinakes' budget for it is small.
 * A link Pinakes refused (`null`: a budget used up, a failure) may be asked again later.
 */
const resolving = new Map<string, Promise<TPinakesResourceDetail | null>>();

function resolveOnce(uri: string): Promise<TPinakesResourceDetail | null> {
  let read = resolving.get(uri);
  if (!read) {
    read = PinakesController.resolveCard({ uri }).then((card) => {
      if (!card) resolving.delete(uri);
      return card;
    });
    resolving.set(uri, read);
  }
  return read;
}

/** One round of re-reading a link: when it started and what it answered. */
type TRecheckRound = { count: number; startedAt: number; read: Promise<TPinakesResourceDetail | null> };

/**
 * The re-reads of each link in this page load, on the link's own schedule: a re-read that comes due
 * before the link's next round (a repost, a preview scrolled back into view) answers the last round,
 * and a link gets the schedule's rounds once (`getRecheckDelay` is `null` past them), however many
 * previews show it.
 */
const rechecks = new Map<string, TRecheckRound>();

/** How early a preview's re-read may come and still start the link's next round. */
const RECHECK_ROUND_TOLERANCE_MS = 1_000;

function recheckOnce(uri: string): Promise<TPinakesResourceDetail | null> {
  const last = rechecks.get(uri);
  const now = Date.now();
  if (last) {
    const wait = getRecheckDelay(last.count);
    if (wait === null || now - last.startedAt < wait - RECHECK_ROUND_TOLERANCE_MS) return last.read;
  }
  const read = PinakesController.fetchCardByUri({ uri, fresh: true });
  rechecks.set(uri, { count: (last?.count ?? 0) + 1, startedAt: now, read });
  return read;
}

/**
 * The card Pinakes read on demand for `uri`, once `uri` has stayed for the debounce; `null` before,
 * when Pinakes refused, or for no `uri`. A link changed or removed before then is never sent.
 */
function useResolvedCard(uri: string | null): TPinakesResourceDetail | null {
  const [resolved, setResolved] = useState<{ uri: string; card: TPinakesResourceDetail | null } | null>(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      resolveOnce(uri).then((card) => {
        if (!cancelled) setResolved({ uri, card });
      });
    }, PINAKES_RESOLVE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);

  return resolved?.uri === uri ? resolved.card : null;
}

/**
 * The Pinakes card for a link.
 *
 * `data` is `null` when there is no card to show: Pinakes does not know the link (404), Pinakes is
 * not configured (`PUBKY_RUNTIME_PINAKES_URL` unset, no request is made), or `uri` is empty.
 * Callers keep their plain link preview then. See `UsePinakesCardOptions` for re-reading a link
 * Pinakes is about to know and for having it read one it does not.
 *
 * @param uri - The link as written in the post
 *
 * @example
 * ```tsx
 * const { data: card, isLoading } = usePinakesCard(url);
 * if (card === null) return <GenericPreview url={url} />;
 * ```
 */
export function usePinakesCard(
  uri: string | null | undefined,
  { recheck = false, resolve = false }: UsePinakesCardOptions = {},
): UsePinakesQueryResult<TPinakesResourceDetail> {
  const enabled = Boolean(uri) && isPinakesConfigured();
  const read = usePinakesQuery({
    key: uri ?? '',
    fetchFn: () => PinakesController.fetchCardByUri({ uri: uri! }),
    enabled,
    recheck: {
      active: recheck,
      delay: (card, count) => (isUnsettledCard(card) ? getRecheckDelay(count) : null),
      // Shared by every preview of the link (see `rechecks`).
      fetchFn: () => recheckOnce(uri!),
    },
  });
  // Only a link Pinakes answered it does not know is sent to be read.
  const resolved = useResolvedCard(resolve && enabled && read.data === null && !read.isError ? uri! : null);
  if (resolved && read.data === null) return { data: resolved, isLoading: false, isError: false };
  return read;
}
