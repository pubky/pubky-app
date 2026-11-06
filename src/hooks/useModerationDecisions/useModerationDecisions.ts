'use client';

import { useEffect } from 'react';
import { getModerationDecisionsUrl } from '@/config/moderation';
import { ModerationDecisionController } from '@/controllers/moderation-decision/moderation-decision';
import type { TModerationDecision } from '@/services/moderation-decision/moderation-decision.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useModerationDecisionStore } from '@/stores/moderationDecision/moderationDecision.store';

const NONE: (TModerationDecision | null)[] = [];

/**
 * The signed-in user's statements of reasons for what moderation restricted, newest first; a `null` entry is a
 * statement this build cannot read. Asks the moderation service when it mounts (at most once a minute), and only when the
 * deployment names one (`PUBKY_RUNTIME_MODERATION_DECISIONS_URL`). Without one it is empty and requests nothing.
 */
export function useModerationDecisions(): (TModerationDecision | null)[] {
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const hasSession = useAuthStore((state) => state.session !== null);
  const forPubky = useModerationDecisionStore((state) => state.forPubky);
  const decisions = useModerationDecisionStore((state) => state.decisions);
  const configured = getModerationDecisionsUrl() !== undefined;

  useEffect(() => {
    if (configured && hasSession && pubky) void ModerationDecisionController.fetchDecisions(pubky);
  }, [configured, hasSession, pubky]);

  return pubky !== null && forPubky === pubky ? decisions : NONE;
}
