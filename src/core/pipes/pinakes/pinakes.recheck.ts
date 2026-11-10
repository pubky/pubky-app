import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * When to read a link's card again: Pinakes reads a link people just referenced within seconds, so
 * "no card" (404) and a `pending` card are read again on a short, growing schedule. Pure policy, used
 * by the card reads (`usePinakesCard`) and the on-demand read (`PinakesApplication.resolveCard`).
 */

/** Whether Pinakes may still answer a better card for a link: none yet (404), or one still read. */
export function isUnsettledCard(card: TPinakesResourceDetail | null | undefined): boolean {
  return card == null || card.status === PinakesStatus.PENDING;
}

/** First wait before an unsettled card is read again; each wait doubles up to the cap. */
export const PINAKES_RECHECK_FIRST_MS = 2_000;
export const PINAKES_RECHECK_MAX_MS = 30_000;
/** No re-read starts once this much waiting has passed: Pinakes reads a new link within seconds. */
export const PINAKES_RECHECK_BUDGET_MS = 2 * 60 * 1000;

/**
 * How long to wait before re-read number `attempt` (0 first) of an unsettled card: 2 s, 4 s, 8 s,
 * 16 s, then 30 s, until the waits add up to about two minutes; `null` once they would pass it.
 */
export function getRecheckDelay(attempt: number): number | null {
  let waited = 0;
  for (let index = 0; ; index++) {
    const delay = Math.min(PINAKES_RECHECK_FIRST_MS * 2 ** index, PINAKES_RECHECK_MAX_MS);
    if (waited + delay > PINAKES_RECHECK_BUDGET_MS) return null;
    if (index === attempt) return delay;
    waited += delay;
  }
}
