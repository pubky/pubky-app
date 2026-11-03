import { z } from 'zod';
import type { ParseResult } from './codes';
import { scanForbiddenPublicState } from './forbidden';
import { fromZod, zUnix } from './zod';

const codePointString = (max: number) =>
  z.string().refine((value) => Array.from(value).length <= max, { message: 'SCHEMA_INVALID' });

export const PubchiOwnerContextV1Schema = z
  .object({
    schema: z.literal('pubchi-owner-context'),
    version: z.literal(1),
    about: codePointString(1500).optional(),
    instructions: codePointString(1000).optional(),
    updated_at: zUnix,
  })
  .catchall(z.unknown());

export type PubchiOwnerContextV1 = z.infer<typeof PubchiOwnerContextV1Schema>;

export function parsePubchiOwnerContextV1(input: unknown): ParseResult<PubchiOwnerContextV1> {
  const forbidden = scanForbiddenPublicState(input);
  if (!forbidden.ok) return forbidden;
  return fromZod(PubchiOwnerContextV1Schema, input);
}

export function contextForRequest(
  context: PubchiOwnerContextV1 | null | undefined,
): { about?: string; instructions?: string } | undefined {
  if (!context) return undefined;
  const about = context.about?.trim();
  const instructions = context.instructions?.trim();
  if (!about && !instructions) return undefined;
  return { ...(about ? { about } : {}), ...(instructions ? { instructions } : {}) };
}
