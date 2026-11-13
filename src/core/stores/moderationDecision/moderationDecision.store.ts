import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  ModerationDecisionActionTypes,
  moderationDecisionInitialState,
  type ModerationDecisionStore,
} from './moderationDecision.types';

/**
 * The signed-in user's statements of reasons from the moderation service. Memory only: they are read afresh on
 * every page load and never persisted, and they belong to one user (`forPubky`).
 */
export const useModerationDecisionStore = create<ModerationDecisionStore>()(
  devtools(
    (set) => ({
      ...moderationDecisionInitialState,

      markLoading: (pubky) => {
        // Statements already read for this user stay on screen while a refresh is in flight.
        set(
          (state) => ({
            status: 'loading',
            forPubky: pubky,
            decisions: state.forPubky === pubky ? state.decisions : [],
          }),
          false,
          ModerationDecisionActionTypes.MARK_LOADING,
        );
      },

      markReady: (pubky, decisions, settledAt) => {
        set(
          { status: 'ready', forPubky: pubky, decisions, settledAt },
          false,
          ModerationDecisionActionTypes.MARK_READY,
        );
      },

      markFailed: (pubky, settledAt) => {
        set(
          (state) => ({
            status: 'failed',
            forPubky: pubky,
            decisions: state.forPubky === pubky ? state.decisions : [],
            settledAt,
          }),
          false,
          ModerationDecisionActionTypes.MARK_FAILED,
        );
      },
    }),
    {
      name: 'moderation-decision-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
