import { z } from 'zod';
import { type PubchiAnswerBasis, PubchiAnswerBasisSchema, PubchiCitationSchema } from './answer';
import type { ParseResult } from './codes';
import { fromZod } from './zod';

export const MAX_CONVERSATION_TURNS = 8;
export const MAX_CONVERSATION_TURN_CODE_POINTS = 600;
export const MAX_CONVERSATION_CODE_POINTS = 4_800;

const codePointLength = (value: string) => Array.from(value).length;

const PUBKY_APP_TARGET_RE =
  /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/pub\/pubky\.app\/(?:posts\/[A-Z0-9]{13}|profile\.json)$/;

export const PubchiTargetSchema = z
  .object({
    kind: z.enum(['post', 'user']),
    uri: z.string().refine((value) => PUBKY_APP_TARGET_RE.test(value), 'INVALID_TARGET'),
  })
  .strict()
  .superRefine((target, ctx) => {
    const isPost = /\/posts\/[A-Z0-9]{13}$/.test(target.uri);
    if ((target.kind === 'post') !== isPost) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kind'], message: 'TARGET_KIND_MISMATCH' });
    }
  });

export type PubchiTarget = z.infer<typeof PubchiTargetSchema>;

export const ConversationTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().refine((value) => codePointLength(value) <= MAX_CONVERSATION_TURN_CODE_POINTS),
    basis: PubchiAnswerBasisSchema.optional(),
    citations: z.array(PubchiCitationSchema).max(8).optional(),
  })
  .strict();

export const ConversationSchema = z
  .object({ turns: z.array(ConversationTurnSchema).max(MAX_CONVERSATION_TURNS) })
  .strict()
  .superRefine((conversation, ctx) => {
    let total = 0;
    conversation.turns.forEach((turn, index) => {
      total += codePointLength(turn.text);
      if (turn.role !== (index % 2 === 0 ? 'user' : 'assistant')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['turns', index, 'role'],
          message: 'conversation turns must alternate, starting with user',
        });
      }
    });
    if (total > MAX_CONVERSATION_CODE_POINTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['turns'], message: 'conversation is too large' });
    }
  });

export const PubchiAskBodySchema = z
  .object({
    question: z.string().min(1).max(500),
    conversation: ConversationSchema.optional(),
    proposal_version: z.literal(2).optional(),
    target_feed_id: z.string().optional(),
    current_feed: z.unknown().optional(),
    target: PubchiTargetSchema.optional(),
  })
  .strict();

export type PubchiAskBody = z.infer<typeof PubchiAskBodySchema>;

export function parsePubchiAskBody(input: unknown): ParseResult<PubchiAskBody> {
  return fromZod(PubchiAskBodySchema, input);
}

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationBasis = PubchiAnswerBasis;

export function parseConversation(input: unknown): ParseResult<Conversation> {
  return fromZod(ConversationSchema, input);
}
