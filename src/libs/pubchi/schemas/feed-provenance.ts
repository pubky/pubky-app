import { z } from 'zod';
import type { ParseResult } from './codes';
import { scanForbiddenPublicState } from './forbidden';
import { fromZod, zPubky, zSha256, zUnix, zVersion1 } from './zod';

export const PubchiFeedProvenanceV1Schema = z
  .object({
    schema: z.literal('pubchi-feed-provenance'),
    version: zVersion1,
    feed_id: z.string().min(1),
    created_at: zUnix,
    updated_at: zUnix.optional(),
    proposal_hash: zSha256,
    bot: zPubky,
    ext: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export type PubchiFeedProvenanceV1 = z.infer<typeof PubchiFeedProvenanceV1Schema>;

export function parsePubchiFeedProvenanceV1(input: unknown): ParseResult<PubchiFeedProvenanceV1> {
  const forbidden = scanForbiddenPublicState(input);
  if (!forbidden.ok) return forbidden;
  return fromZod(PubchiFeedProvenanceV1Schema, input);
}
