'use client';

import { Container } from '@/atoms/Container/Container';
import { useModerationDecisions } from '@/hooks/useModerationDecisions/useModerationDecisions';
import { ModerationDecisionCard } from '../ModerationDecisionCard/ModerationDecisionCard';

/** The statements of reasons for what moderation restricted of the signed-in user's, newest first. Nothing without any. */
export function ModerationDecisionNotices() {
  const decisions = useModerationDecisions();
  if (decisions.length === 0) return null;
  return (
    <Container overrideDefaults={true} className="flex flex-col gap-3" data-cy="moderation-decision-notices">
      {decisions.map((decision, index) => (
        <ModerationDecisionCard key={decision?.id ?? `unreadable-${index}`} decision={decision} />
      ))}
    </Container>
  );
}
