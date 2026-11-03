/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

import { z } from 'zod';
import { err, ok, type ParseResult } from './codes';
import { isAllowlistedPath } from './paths';
import { fromZod, zPubky, zSha256, zUnix, zVersion1 } from './zod';

const ManifestEntryV1Schema = z
  .object({
    path: z.string(),
    schema: z.string().regex(/^pubchi-[a-z0-9-]+$/),
    version: zVersion1,
    bytes: z.number().int().nonnegative().max(1_000_000),
    sha256: zSha256,
  })
  .strict();

export const ManifestV1Schema = z
  .object({
    schema: z.literal('pubchi-manifest'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    updated_at: zUnix,
    objects: z.array(ManifestEntryV1Schema).max(256),
  })
  .strict();

export type ManifestV1 = z.infer<typeof ManifestV1Schema>;

export function parseManifestV1(input: unknown): ParseResult<ManifestV1> {
  const shaped = fromZod(ManifestV1Schema, input);
  if (!shaped.ok) return shaped;
  for (const entry of shaped.value.objects) {
    if (!isAllowlistedPath(entry.path)) return err('PATH_FORBIDDEN');
  }
  return ok(shaped.value);
}
