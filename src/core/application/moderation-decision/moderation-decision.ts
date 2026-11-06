import { ModerationDecisionService } from '@/services/moderation-decision/moderation-decision';
import type { TModerationDecisionsResult } from '@/services/moderation-decision/moderation-decision.types';

export class ModerationDecisionApplication {
  private constructor() {}

  /** The signed-in user's statements of reasons, or `unavailable` when the moderation service could not answer. */
  static fetchDecisions(): Promise<TModerationDecisionsResult> {
    return ModerationDecisionService.fetchDecisions();
  }
}
