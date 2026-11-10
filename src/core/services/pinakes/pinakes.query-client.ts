import type { Query } from '@tanstack/react-query';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { createQueryClient } from '@/libs/query-client/query-client.factory';
import { isUnsettledCard } from '@/pipes/pinakes/pinakes.recheck';
import type { TPinakesResourceDetail } from './pinakes.types';

const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Pinakes API Query Client
 *
 * Caches card, related and group reads. A card is a read of an external page that changes rarely,
 * and the same link can render in many posts of one feed, so reads stay fresh for five minutes:
 * scrolling a feed back and forth asks Pinakes once per link, well inside its per-IP budget
 * (120 requests a minute by default, `/v1/info`).
 *
 * A 404 never reaches the retry policy: the service answers it as "no card" (`null`).
 * Failures are not cached, so the next read of a link that failed asks again.
 */
export const pinakesQueryClient = createQueryClient({
  retry: {
    // BAD_REQUEST: a parameter Pinakes cannot use, it names it; the same request fails again.
    // INVALID_RESPONSE: malformed body, won't change on retry.
    nonRetryable: [ClientErrorCode.BAD_REQUEST, ServerErrorCode.INVALID_RESPONSE],
    limits: {
      // 429 comes with `Retry-After: 60`. A card is optional: falling back to the plain link
      // preview at once beats a skeleton held for a minute, so a 429 is never retried.
      rateLimited: 0,
      // Pinakes's own guidance for 500/502 is "retry once" (`/llms.txt`, Errors).
      serverError: 1,
      // Network failures and timeouts (offline, CORS, an ad blocker, a stalled connection) rarely
      // clear within seconds; one retry, so a card does not hold its skeleton for long.
      default: 1,
    },
    delays: {
      serverError: { initial: 1_000, max: 10_000 },
      default: { initial: 1_000, max: 60_000 },
    },
  },
  staleTime: STALE_TIME_MS,
});

/** How long "no card" (404) and a `pending` card stay fresh: Pinakes may read the link any moment. */
export const PINAKES_UNSETTLED_CARD_STALE_TIME_MS = 30 * 1000;

/**
 * `staleTime` of a by-uri read. A link in a post that was just published is the likeliest 404
 * (`/llms.txt`: "nobody referenced it, or it has not been read"), so "no card" and a `pending`
 * card are read again after 30 s instead of five minutes.
 */
export function pinakesCardStaleTime(query: Query<TPinakesResourceDetail | null>): number {
  return isUnsettledCard(query.state.data) ? PINAKES_UNSETTLED_CARD_STALE_TIME_MS : STALE_TIME_MS;
}
