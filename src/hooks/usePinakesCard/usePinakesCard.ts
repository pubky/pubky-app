'use client';

import { useEffect, useState } from 'react';
import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { usePinakesQuery } from '@/hooks/usePinakesQuery/usePinakesQuery';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import { getAppLinkReference } from '@/libs/pubkyApp/appLink';
import { isPubkyAppAddress } from '@/libs/pubkyApp/pubkyAppTarget';
import { getRecheckDelay, isUnsettledCard } from '@/pipes/pinakes/pinakes.recheck';
import type { TPinakesBusy } from '@/services/pinakes/pinakes';
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
   * With `resolve`, a 404 is left to the resolve and only a `pending` card is re-read.
   */
  recheck?: boolean;
  /**
   * Asks Pinakes to read a link it does not know (`POST /v1/resolve`), once per link, after it has
   * stayed as written for `PINAKES_RESOLVE_DEBOUNCE_MS`: for a link being written into a post, or
   * opened on its resource page.
   */
  resolve?: boolean;
  /**
   * Asks Pinakes to read a link it answered it does not know, while `true` (the box is near the
   * screen; `resolveOnView`): a platform's link (a YouTube or Vimeo video, an X post) shows its card
   * instead of waiting for a press. Once per link per page load, from the viewer's browser, so Pinakes
   * counts it against the viewer's own budget; never a `pubky://` or pubky.app link, nor one that is
   * not `http(s)`.
   */
  resolveOnView?: boolean;
}

/**
 * One resolve per link at a time, its card kept for the page load: Pinakes' budget for it is small.
 * A link Pinakes refused (`null`: a budget used up, a failure) may be asked again later.
 */
const resolving = new Map<string, Promise<TPinakesResourceDetail | null>>();
/** The links of `resolving` whose read has not answered yet. */
const inFlight = new Set<string>();

function resolveOnce(uri: string): Promise<TPinakesResourceDetail | null> {
  let read = resolving.get(uri);
  if (!read) {
    inFlight.add(uri);
    read = PinakesController.resolveCard({ uri }).then(
      (answer) => {
        inFlight.delete(uri);
        // Refused, or busy for now: a later ask may be answered.
        const card = isBusy(answer) ? null : answer;
        if (!card) resolving.delete(uri);
        return card;
      },
      () => {
        inFlight.delete(uri);
        resolving.delete(uri);
        return null;
      },
    );
    resolving.set(uri, read);
  }
  return read;
}

/** How often one link is asked on view at most: a second time only after Pinakes was busy. */
const VIEW_RESOLVE_ATTEMPTS = 2;
/** Links asked on view at once at most; the others wait their turn, in order. */
export const PINAKES_VIEW_RESOLVES_AT_ONCE = 2;
/** How long no link is asked on view after Pinakes was busy without a `Retry-After`. */
export const PINAKES_VIEW_RESOLVE_PAUSE_MS = 60_000;
/** The longest `Retry-After` honoured: past it, Pinakes is asked again once a box comes near the screen. */
export const PINAKES_VIEW_RESOLVE_MAX_PAUSE_MS = 10 * 60_000;

/** The links asked on view in this page load and their answers: a link Pinakes read or refused is never asked again. */
const viewResolves = new Map<string, Promise<TPinakesResourceDetail | null>>();
/** How often each link was asked on view. */
const viewAttempts = new Map<string, number>();
/** Until when (epoch ms) no link is asked on view: Pinakes was busy or failing (its `Retry-After`). */
let viewPausedUntil = 0;
/** Asks on view running now, and the ones waiting for a turn. */
let viewRunning = 0;
const viewWaiting: (() => void)[] = [];
/** How many mounted previews want each link read on view: a waiting ask nobody wants any more is not sent. */
const viewWanted = new Map<string, number>();

function wantOnView(uri: string, delta: 1 | -1): void {
  const count = (viewWanted.get(uri) ?? 0) + delta;
  if (count > 0) viewWanted.set(uri, count);
  else viewWanted.delete(uri);
}

/** Runs `ask` once fewer than `PINAKES_VIEW_RESOLVES_AT_ONCE` asks on view run; the next waiting one after it. */
function inViewTurn<T>(ask: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const start = () => {
      viewRunning += 1;
      ask()
        .then(resolve)
        .finally(() => {
          viewRunning -= 1;
          viewWaiting.shift()?.();
        });
    };
    if (viewRunning < PINAKES_VIEW_RESOLVES_AT_ONCE) start();
    else viewWaiting.push(start);
  });
}

/** Whether a link is one Pinakes may be asked to read on view: `http(s)`, not pubky.app's own. */
function isViewResolvable(uri: string): boolean {
  return /^https?:\/\//i.test(uri) && !isPubkyAppAddress(uri);
}

/**
 * Asks Pinakes to read `uri` as its box comes near the screen (`resolveOnView`): the card it read, or
 * `null`. A `pending` answer is not polled by its ID: the link's card read, re-read while on screen
 * (`recheck`), follows it. Each link is asked once per page load and its answer kept, a refusal too
 * (no loop on a 4xx). At most `PINAKES_VIEW_RESOLVES_AT_ONCE` asks run at once, the others in turn.
 * Pinakes busy or failing (429, 5xx, no answer) asks no link until its `Retry-After` has passed
 * (`PINAKES_VIEW_RESOLVE_PAUSE_MS` without one), so an outage costs one failed ask, not one per link,
 * and leaves the link to be asked once more by a later view (`VIEW_RESOLVE_ATTEMPTS`). An ask whose turn
 * comes during a pause, or once no mounted preview wants the link any more, is not sent. A resolve of the link already in flight (the composer's) is joined.
 */
function resolveOnViewOnce(uri: string): Promise<TPinakesResourceDetail | null> {
  const joined = resolving.get(uri) ?? viewResolves.get(uri);
  if (joined) return joined;
  if (Date.now() < viewPausedUntil || (viewAttempts.get(uri) ?? 0) >= VIEW_RESOLVE_ATTEMPTS) {
    return Promise.resolve(null);
  }
  const read = inViewTurn(async () => {
    // Paused meanwhile, or every preview that wanted it is gone (a link typed on, scrolled past): not sent.
    if (Date.now() < viewPausedUntil || !viewWanted.has(uri)) {
      viewResolves.delete(uri);
      return null;
    }
    viewAttempts.set(uri, (viewAttempts.get(uri) ?? 0) + 1);
    const answer = await PinakesController.resolveCard({ uri, poll: false }).catch(() => null);
    if (!isBusy(answer)) return answer;
    const pause = Math.min(answer.retryAfterMs ?? PINAKES_VIEW_RESOLVE_PAUSE_MS, PINAKES_VIEW_RESOLVE_MAX_PAUSE_MS);
    viewPausedUntil = Math.max(viewPausedUntil, Date.now() + pause);
    viewResolves.delete(uri);
    return null;
  });
  viewResolves.set(uri, read);
  return read;
}

function isBusy(answer: TPinakesResourceDetail | TPinakesBusy | null): answer is TPinakesBusy {
  return answer !== null && 'busy' in answer && answer.busy === true;
}

/** Forgets the links asked on view and any pause (tests: one page load each). */
export function resetViewResolves(): void {
  viewResolves.clear();
  viewAttempts.clear();
  viewPausedUntil = 0;
  viewRunning = 0;
  viewWaiting.length = 0;
  viewWanted.clear();
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
 * Without `ask`, nothing is sent: a resolve of `uri` already in flight (the composer's, the
 * resource page's) is waited for, as a post just published shows the link its composer is reading.
 */
function useResolvedCard(
  uri: string | null,
  ask: boolean,
  onView: boolean,
): { card: TPinakesResourceDetail | null; pending: boolean } {
  const [resolved, setResolved] = useState<{ uri: string; card: TPinakesResourceDetail | null } | null>(null);
  // Read on each render: a preview that re-renders while a resolve is in flight waits for it.
  const joinable = !ask && uri !== null && inFlight.has(uri);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    const settle = (card: TPinakesResourceDetail | null) => {
      if (!cancelled) setResolved({ uri, card });
    };
    if (!ask && onView) {
      wantOnView(uri, 1);
      resolveOnViewOnce(uri).then(settle);
      return () => {
        wantOnView(uri, -1);
        cancelled = true;
      };
    }
    if (!ask) {
      if (joinable) {
        // Answered (refused) between that render and this effect: nothing to wait for.
        const read = resolving.get(uri);
        if (read) read.then(settle);
        else settle(null);
      }
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => {
      resolveOnce(uri).then(settle);
    }, PINAKES_RESOLVE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri, ask, onView, joinable]);

  const settled = resolved?.uri === uri;
  return { card: settled ? resolved.card : null, pending: uri !== null && !settled && (ask || onView || joinable) };
}

/**
 * The Pinakes card for a link.
 *
 * `data` is `null` when there is no card to show: Pinakes does not know the link (404), Pinakes is
 * not configured (`PUBKY_RUNTIME_PINAKES_URL` unset, no request is made), `uri` is empty, or `uri`
 * links a post or a profile on the host the app runs on (`getAppLinkReference`): the app's own object,
 * never an external resource, so Pinakes is neither read nor asked to read it.
 * Callers keep their plain link preview then. See `UsePinakesCardOptions` for re-reading a link
 * Pinakes is about to know and for having it read one it does not (`resolve`, `resolveOnView`;
 * `isResolving` while it is asked).
 * Without `resolve`, a link Pinakes does not know that is being read on demand elsewhere in the
 * page load (a post just published from the composer) is `isResolving` too, until that read answers,
 * and shows the card it read.
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
  { recheck = false, resolve = false, resolveOnView = false }: UsePinakesCardOptions = {},
): UsePinakesQueryResult<TPinakesResourceDetail> & { isResolving?: boolean } {
  const enabled = Boolean(uri) && isPinakesConfigured() && getAppLinkReference(uri ?? '') === null;
  const read = usePinakesQuery({
    key: uri ?? '',
    fetchFn: () => PinakesController.fetchCardByUri({ uri: uri! }),
    enabled,
    recheck: {
      active: recheck,
      // With `resolve`, a link Pinakes does not know is read by the resolve, not re-read here too. A link
      // read on view is re-read here, as it is not polled by its ID.
      delay: (card, count) => (isUnsettledCard(card) && !(resolve && card === null) ? getRecheckDelay(count) : null),
      // Shared by every preview of the link (see `rechecks`).
      fetchFn: () => recheckOnce(uri!),
    },
  });
  // Only a link Pinakes answered it does not know is sent to be read (or waited for, see above).
  const unknown = enabled && read.data === null && !read.isError ? uri! : null;
  const resolved = useResolvedCard(
    unknown,
    resolve,
    resolveOnView && unknown !== null && !resolve && isViewResolvable(unknown),
  );
  if (resolved.card && read.data === null) return { data: resolved.card, isLoading: false, isError: false };
  // `isResolving`: Pinakes did not know the link and is being asked to read it (`resolve`, or a
  // resolve already in flight elsewhere in the page load), so a card may still come; a preview that
  // must not load anything before it knows waits for it.
  return resolved.pending ? { ...read, isResolving: true } : read;
}
