import type { Pubky } from '@/models/models.types';
import type { TModerationDecision } from '@/services/moderation-decision/moderation-decision.types';

export type ModerationDecisionStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface ModerationDecisionState {
  status: ModerationDecisionStatus;
  /** The user the statements were read for; a different signed-in user sees none of them. */
  forPubky: Pubky | null;
  /** Newest first; `null` is a statement this build cannot read. */
  decisions: (TModerationDecision | null)[];
  /** When the last read settled, in epoch milliseconds; 0 before one has. */
  settledAt: number;
}

interface ModerationDecisionActions {
  markLoading: (pubky: Pubky) => void;
  markReady: (pubky: Pubky, decisions: (TModerationDecision | null)[], settledAt: number) => void;
  markFailed: (pubky: Pubky, settledAt: number) => void;
}

export type ModerationDecisionStore = ModerationDecisionState & ModerationDecisionActions;

export const moderationDecisionInitialState: ModerationDecisionState = {
  status: 'idle',
  forPubky: null,
  decisions: [],
  settledAt: 0,
};

export enum ModerationDecisionActionTypes {
  MARK_LOADING = 'MARK_LOADING',
  MARK_READY = 'MARK_READY',
  MARK_FAILED = 'MARK_FAILED',
}
