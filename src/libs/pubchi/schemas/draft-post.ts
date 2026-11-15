import { z } from 'zod';
import { PUBKY_APP_POST_URI } from './answer';
import { SHA256_HEX_RE } from './canonical';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

const draftPostReceiptStatus = z.enum(['applying', 'applied', 'failed', 'reverted', 'rejected']);

export const PubchiDraftPostReceiptSchema = z
  .object({
    schema: z.literal('pubchi-draft-post'),
    version: zVersion1,
    application_id: z.string().regex(SHA256_HEX_RE),
    owner: zPubky,
    bot: zPubky,
    run_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    draft_sha256: z.string().regex(SHA256_HEX_RE),
    kind: z.enum(['short', 'long']),
    content: z.string().min(1),
    tags: z.array(z.string().min(1).max(20)).max(5).optional(),
    parent_uri: z.string().optional(),
    rationale: z.string().min(1).max(120),
    evidence: z
      .array(
        z
          .string()
          .min(1)
          .max(512)
          .refine((value) => value.startsWith('pubky://')),
      )
      .max(8),
    post_uri: z.string().regex(PUBKY_APP_POST_URI).optional(),
    status: draftPostReceiptStatus,
    suggested_at: zUnix,
    applied_at: zUnix.optional(),
    reverted_at: zUnix.optional(),
    rejected_at: zUnix.optional(),
    ext: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export type PubchiDraftPostReceipt = z.infer<typeof PubchiDraftPostReceiptSchema>;

export function parsePubchiDraftPostReceipt(input: unknown) {
  return fromZod(PubchiDraftPostReceiptSchema, input);
}
