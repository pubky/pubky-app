import { z } from 'zod';
import { err, ok, type ParseResult } from './codes';
import { scanForbiddenPublicState } from './forbidden';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

export const DEFAULT_SEND_PUBLIC_WEB_CONTEXT = false;

const topicLabel = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !/^\S+(?:\s+\S+){11}$/.test(value), { message: 'SCHEMA_INVALID' });

const topicSchema = z.object({ label: topicLabel, weight: z.number().int().min(1).max(5) }).strict();

const brainSchema = z
  .object({
    adapter: z.literal('vercel-ai'),
    execution: z.enum(['synonym-hosted', 'self-hosted']),
    provider_id: z.enum(['moonshot', 'openai-compatible', 'ollama']),
    model_id: z.string().trim().min(1).max(64),
    endpoint: z.url().nullable(),
    send_public_graph_context: z.boolean(),
    send_public_web_context: z.boolean(),
  })
  .strict()
  .superRefine((brain, context) => {
    if (brain.endpoint !== null) {
      const endpoint = new URL(brain.endpoint);
      if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['endpoint'], message: 'SCHEMA_INVALID' });
      }
    }
    if (brain.execution === 'synonym-hosted' && brain.endpoint !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['endpoint'], message: 'SCHEMA_INVALID' });
    }
    if (brain.execution === 'self-hosted' && (brain.endpoint === null || !/^https?:\/\//.test(brain.endpoint))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['endpoint'], message: 'SCHEMA_INVALID' });
    }
  });

export const PubchiConfigV1Schema = z
  .object({
    schema: z.literal('pubchi-config'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    updated_at: zUnix,
    display_name: z.string().trim().min(1).max(40),
    tier: z.enum(['read-only', 'assisted', 'autonomous']),
    language: z.string().regex(/^[A-Za-z]{2,8}$/),
    summary: z
      .object({
        length: z.enum(['short', 'medium', 'long']),
        include_sources: z.boolean(),
        include_disagreement: z.boolean(),
      })
      .strict(),
    interests: z
      .object({
        topics: z.array(topicSchema).max(20),
        excluded_topics: z.array(topicLabel).max(20),
      })
      .strict(),
    proactive: z
      .object({
        enabled: z.boolean(),
        max_suggestions_per_day: z.number().int().min(0).max(10),
        quiet_hours_utc: z
          .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
          .strict(),
      })
      .strict(),
    follower_history_opt_in: z.boolean(),
    brain: brainSchema,
    ext: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export type PubchiConfigV1 = z.infer<typeof PubchiConfigV1Schema>;

export function parsePubchiConfigV1(input: unknown): ParseResult<PubchiConfigV1> {
  const forbidden = scanForbiddenPublicState(input);
  if (!forbidden.ok) return forbidden;
  const result = fromZod(PubchiConfigV1Schema, input);
  return result.ok ? ok(result.value) : err(result.code);
}
