/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * App adaptation for social v1. The deployed service must use the same contract.
 */

import { z } from 'zod';
import { parsePublicSocialUri } from '@/libs/pubchi/uri';
import { err, ok, type ParseResult } from './codes';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

export const QueryItemV1Schema = z
  .object({
    label: z.string().min(1).max(40),
    source_uri: z.string(),
    subject_uri: z.string(),
    claimant_count: z.number().int().nonnegative().max(10_000),
  })
  .strict();

export const ToolTraceSummaryV1Schema = z
  .object({
    tools: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)).max(16),
    call_count: z.number().int().nonnegative().max(64),
    truncated: z.boolean(),
  })
  .strict();

export const QueryResultV1Schema = z
  .object({
    schema: z.literal('pubchi-query-result'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    generated_at: zUnix,
    run_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    purpose: z.literal('who-tagged-me'),
    scope_owner: zPubky,
    items: z.array(QueryItemV1Schema).max(100),
    tool_trace_summary: ToolTraceSummaryV1Schema,
    policy_version: z.literal(1),
  })
  .strict();

export type QueryResultV1 = z.infer<typeof QueryResultV1Schema>;

export function parseQueryResultV1(input: unknown): ParseResult<QueryResultV1> {
  const shaped = fromZod(QueryResultV1Schema, input);
  if (!shaped.ok) return shaped;
  const value = shaped.value;
  if (value.scope_owner !== value.owner) return err('ASKER_MISMATCH');
  for (const item of value.items) {
    if (!parsePublicSocialUri(item.source_uri) || parsePublicSocialUri(item.subject_uri)?.owner !== value.owner) {
      return err('URI_FORBIDDEN');
    }
  }
  return ok(value);
}
