import { z } from 'zod';

/** The restriction a decision imposed (DSA Art. 17(1)(a), (c), (d)). */
export const MODERATION_RESTRICTIONS = [
  'content_visibility_restricted',
  'content_removed',
  'account_disabled',
] as const;

/**
 * One statement of reasons as the moderation service sends it (`GET /v1/decisions`, wire format in the
 * pubky-moderation `checkstep-response-service/docs/decisions-api.md`), in the app's casing.
 */
export const moderationDecisionSchema = z
  .object({
    id: z.uuid(),
    restriction: z.enum(MODERATION_RESTRICTIONS),
    target_uri: z.string().min(1).nullable(),
    territorial_scope: z.string().min(1),
    ends_at: z.iso.datetime({ offset: true }).nullable(),
    decided_at: z.iso.datetime({ offset: true }),
    basis: z.enum(['notice', 'own_initiative']),
    facts: z.string().min(1),
    automated_detection: z.boolean(),
    automated_decision: z.boolean(),
    automated_means: z.string().min(1).nullable(),
    ground: z.enum(['illegal_content', 'terms']),
    ground_reference: z.string().min(1),
    explanation: z.string().min(1),
  })
  // The service describes automated means exactly when they were used; a statement that says otherwise
  // would misstate how the decision was taken.
  .refine(
    (decision) => (decision.automated_detection || decision.automated_decision) === (decision.automated_means !== null),
    {
      message: 'automated_means must be present exactly when automated means were used',
    },
  )
  .transform((decision) => ({
    id: decision.id,
    restriction: decision.restriction,
    targetUri: decision.target_uri,
    territorialScope: decision.territorial_scope,
    endsAt: decision.ends_at,
    decidedAt: decision.decided_at,
    basis: decision.basis,
    facts: decision.facts,
    automatedDetection: decision.automated_detection,
    automatedDecision: decision.automated_decision,
    automatedMeans: decision.automated_means,
    ground: decision.ground,
    groundReference: decision.ground_reference,
    explanation: decision.explanation,
  }));

export type TModerationDecision = z.output<typeof moderationDecisionSchema>;

/**
 * The user's statements, newest first. A `null` entry is a statement this build cannot read (an unknown
 * restriction, a field that fails validation): it still reaches the user, who is pointed to the appeal route.
 */
export type TModerationDecisionsResult =
  { status: 'ready'; decisions: (TModerationDecision | null)[] } | { status: 'unavailable' };
