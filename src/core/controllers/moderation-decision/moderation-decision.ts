import { ModerationDecisionApplication } from '@/application/moderation-decision/moderation-decision';
import type { Pubky } from '@/models/models.types';
import { useModerationDecisionStore } from '@/stores/moderationDecision/moderationDecision.store';

/** A read, successful or not, is reused for this long, so opening the page twice does not ask twice. */
export const MODERATION_DECISION_FRESH_MS = 60_000;

export class ModerationDecisionController {
  private constructor() {}

  /**
   * Reads `pubky`'s statements of reasons, unless a read for them is in flight or settled less than a minute ago.
   * A failed read keeps what was already on screen and is tried again after the minute. Another user signing in
   * on the same page reads their own.
   */
  static async fetchDecisions(pubky: Pubky): Promise<void> {
    const store = useModerationDecisionStore.getState();
    if (store.forPubky === pubky) {
      if (store.status === 'loading') return;
      if (store.status !== 'idle' && Date.now() - store.settledAt < MODERATION_DECISION_FRESH_MS) return;
    }
    store.markLoading(pubky);
    const result = await ModerationDecisionApplication.fetchDecisions();
    // Signing out or switching accounts while the read was in flight must not hand these to the next user.
    if (useModerationDecisionStore.getState().forPubky !== pubky) return;
    if (result.status === 'ready') store.markReady(pubky, result.decisions, Date.now());
    else store.markFailed(pubky, Date.now());
  }
}
