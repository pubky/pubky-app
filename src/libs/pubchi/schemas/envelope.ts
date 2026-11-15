/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

import { z } from 'zod';
import type { ParseResult } from './codes';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

export const SCHEMA_NAMES = [
  'pubchi-tenant',
  'pubchi-owner-binding',
  'pubchi-request',
  'pubchi-request-object',
  'pubchi-feed-proposal',
  'pubchi-query-result',
  'pubchi-manifest',
  'pubchi-config',
  'pubchi-envelope',
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

export const CommonEnvelopeV1Schema = z
  .object({
    schema: z.enum(SCHEMA_NAMES),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    updated_at: zUnix,
  })
  .strict();

export type CommonEnvelopeV1 = z.infer<typeof CommonEnvelopeV1Schema>;

export function parseCommonEnvelopeV1(input: unknown): ParseResult<CommonEnvelopeV1> {
  return fromZod(CommonEnvelopeV1Schema, input);
}

export function envelopeFields(schema: SchemaName, bot: string, owner: string, updatedAt: number): CommonEnvelopeV1 {
  return { schema, version: 1, bot, owner, updated_at: updatedAt };
}
