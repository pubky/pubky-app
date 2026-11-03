import { z } from 'zod';
import { PubchiTargetSchema } from './ask-body';
import { SHA256_HEX_RE } from './canonical';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

const tagApplicationStatus = z.enum(['applying', 'applied', 'superseded', 'failed', 'reverted']);

export const PubchiTagApplicationSchema = z
  .object({
    schema: z.literal('pubchi-tag-application'),
    version: zVersion1,
    application_id: z.string().regex(SHA256_HEX_RE),
    owner: zPubky,
    bot: zPubky,
    run_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    target: PubchiTargetSchema.extend({ snapshot_sha256: z.string().regex(SHA256_HEX_RE) }).passthrough(),
    label: z.string().min(1).max(80),
    source: z.enum(['vocab', 'open']),
    evidence: z
      .array(
        z
          .string()
          .min(1)
          .max(512)
          .refine((value) => value.startsWith('pubky://')),
      )
      .max(8),
    suggestion_sha256: z.string().regex(SHA256_HEX_RE),
    tag_uri: z.url().optional(),
    status: tagApplicationStatus,
    already_existed: z.boolean().nullable().optional(),
    suggested_at: zUnix,
    applied_at: zUnix.optional(),
    reverted_at: zUnix.optional(),
    ext: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export type PubchiTagApplication = z.infer<typeof PubchiTagApplicationSchema>;

export function parsePubchiTagApplication(input: unknown) {
  return fromZod(PubchiTagApplicationSchema, input);
}
