import { z } from 'zod';

const sessionReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cookie'), sessionExport: z.string().min(1) }),
  z.object({
    kind: z.literal('grant'),
    sessionStoreId: z.string().min(1),
    clientId: z.string().min(1),
    grantId: z.string().min(1),
    grantExpiresAt: z.number().finite(),
    tokenExpiresAt: z.number().finite(),
  }),
]);

/** Grant secrets stay in the SDK's IndexedDB; this record contains only public metadata. */
export type SessionReference = z.infer<typeof sessionReferenceSchema>;
export type SessionRestoreStatus = 'idle' | 'restoring' | 'ready' | 'temporary-error' | 'reauth-required';

export const persistedAuthSchema = z.object({
  currentUserPubky: z.string().nullable(),
  sessionReference: sessionReferenceSchema.nullable(),
  hasProfile: z.boolean().nullable(),
  generation: z.string(),
  retiringSession: sessionReferenceSchema.nullable().default(null),
});
export type PersistedAuth = z.infer<typeof persistedAuthSchema>;
