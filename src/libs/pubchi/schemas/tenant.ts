/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

import { z } from 'zod';
import { err, ok, type ParseResult } from './codes';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

/** Phase 0: read-only only. Assisted/autonomous are later tiers. */
export const PHASE0_TIER = 'read-only' as const;

export const PHASE0_BRAIN = {
  adapter: 'vercel-ai',
  execution: 'synonym-hosted',
  provider_id: 'moonshot',
  model_id: 'kimi-k3',
  endpoint: null,
} as const;

/** Frozen Phase 0 budgets. A different number is BUDGET_NOT_FIXED. */
export const PHASE0_BUDGETS = {
  per_request_input_tokens: 8_000,
  per_request_output_tokens: 2_000,
  per_request_wall_clock_ms: 30_000,
  per_owner_hourly_tokens: 50_000,
  per_owner_utc_day_tokens: 200_000,
  per_tenant_scout_queries: 20,
  per_tenant_scout_rows: 200,
  per_tenant_web_calls: 0,
  proactive_suggestions_per_day: 0,
} as const;

const BrainRefV1Schema = z
  .object({
    adapter: z.literal(PHASE0_BRAIN.adapter),
    execution: z.literal(PHASE0_BRAIN.execution),
    provider_id: z.literal(PHASE0_BRAIN.provider_id),
    model_id: z.literal(PHASE0_BRAIN.model_id),
    endpoint: z.literal(null),
  })
  .strict();

const BudgetsV1Schema = z
  .object({
    per_request_input_tokens: z.literal(PHASE0_BUDGETS.per_request_input_tokens),
    per_request_output_tokens: z.literal(PHASE0_BUDGETS.per_request_output_tokens),
    per_request_wall_clock_ms: z.literal(PHASE0_BUDGETS.per_request_wall_clock_ms),
    per_owner_hourly_tokens: z.literal(PHASE0_BUDGETS.per_owner_hourly_tokens),
    per_owner_utc_day_tokens: z.literal(PHASE0_BUDGETS.per_owner_utc_day_tokens),
    per_tenant_scout_queries: z.literal(PHASE0_BUDGETS.per_tenant_scout_queries),
    per_tenant_scout_rows: z.literal(PHASE0_BUDGETS.per_tenant_scout_rows),
    per_tenant_web_calls: z.literal(PHASE0_BUDGETS.per_tenant_web_calls),
    proactive_suggestions_per_day: z.literal(PHASE0_BUDGETS.proactive_suggestions_per_day),
  })
  .strict();

export const TenantV1Schema = z
  .object({
    schema: z.literal('pubchi-tenant'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    tier: z.literal(PHASE0_TIER),
    brain: BrainRefV1Schema,
    budgets: BudgetsV1Schema,
    created_at: zUnix,
    updated_at: zUnix,
  })
  .strict();

export type TenantV1 = z.infer<typeof TenantV1Schema>;

export function parseTenantV1(input: unknown): ParseResult<TenantV1> {
  const result = fromZod(TenantV1Schema, input);
  if (!result.ok) return result;
  if (result.value.updated_at < result.value.created_at) return err('SCHEMA_INVALID');
  return ok(result.value);
}

export const OwnerBindingV1Schema = z
  .object({
    schema: z.literal('pubchi-owner-binding'),
    version: zVersion1,
    owner: zPubky,
    bot: zPubky,
    status: z.enum(['active', 'revoked']),
    key_generation: z.number().int().min(1).optional(),
    created_at: zUnix,
    updated_at: zUnix,
  })
  .strict();

export type OwnerBindingV1 = z.infer<typeof OwnerBindingV1Schema>;

export function parseOwnerBindingV1(input: unknown): ParseResult<OwnerBindingV1> {
  return fromZod(OwnerBindingV1Schema, input);
}
