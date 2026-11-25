/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

import { z, ZodError, type ZodType } from 'zod';
import { err, type ErrorCode, ok, type ParseResult } from './codes';
import { scanForbidden } from './forbidden';
import { isPubkyId } from './pubky';

export const zPubky = z.string().refine(isPubkyId, { message: 'INVALID_PUBKY' });
export const zUnix = z.number().int().nonnegative();
export const zSha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const zVersion1 = z.literal(1);
export const zVersion2 = z.literal(2);

export function fromZod<T>(schema: ZodType<T>, input: unknown): ParseResult<T> {
  const forbidden = scanForbidden(input);
  if (!forbidden.ok) return forbidden;
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err(mapZod(parsed.error));
}

function mapZod(error: ZodError): ErrorCode {
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') return 'UNKNOWN_FIELD';
    if (issue.path.includes('version')) return 'VERSION_UNSUPPORTED';
    if (issue.path.includes('tier')) return 'TIER_UNSUPPORTED';
    if (issue.path.includes('purpose')) return 'PURPOSE_UNSUPPORTED';
    if (
      issue.message === 'INVALID_PUBKY' ||
      issue.path.includes('bot') ||
      issue.path.includes('owner') ||
      issue.path.includes('asker')
    ) {
      if (issue.message === 'INVALID_PUBKY') return 'INVALID_PUBKY';
    }
    if (issue.path.some((p) => p === 'brain' || String(p).startsWith('brain'))) return 'BRAIN_FORBIDDEN';
    if (issue.path.some((p) => String(p).includes('budget') || p === 'budgets')) return 'BUDGET_NOT_FIXED';
  }
  return 'SCHEMA_INVALID';
}
