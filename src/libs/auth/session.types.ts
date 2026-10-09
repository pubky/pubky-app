import type { Session } from '@synonymdev/pubky';
import { z } from 'zod';

export const sessionReferenceSchema = z.object({
  kind: z.literal('grant'),
  sessionStoreId: z.string().min(1),
  clientId: z.string().min(1),
  grantId: z.string().min(1),
  grantExpiresAt: z.number().finite(),
  tokenExpiresAt: z.number().finite(),
});

/** Grant secrets stay in the SDK's IndexedDB; this record contains only public metadata. */
export type SessionReference = z.infer<typeof sessionReferenceSchema>;
/** Identity of the active session that made a request; never persisted or sent across tabs. */
export type ActiveSessionFailure = { session: Session; generation: string };

export type SessionRestoreStatus = 'idle' | 'restoring' | 'ready' | 'temporary-error' | 'reauth-required';

export const persistedAuthSchema = z.object({
  currentUserPubky: z.string().nullable(),
  sessionReference: sessionReferenceSchema.nullable(),
  hasProfile: z.boolean().nullable(),
  generation: z.string(),
  retiringSession: sessionReferenceSchema.nullable().default(null),
  /** All outstanding revocations, including those retained after local sign-out. */
  pendingRetirements: z.array(sessionReferenceSchema).optional(),
  /** A committed account switch must finish shared database cleanup before bootstrap. */
  needsAccountPreparation: z.boolean().optional(),
});
export type PersistedAuth = z.infer<typeof persistedAuthSchema>;

/** Include the single predecessor saved by earlier builds of the grant migration. */
export function pendingRetirements(record: {
  retiringSession?: SessionReference | null;
  pendingRetirements?: SessionReference[];
}): SessionReference[] {
  const references = [record.retiringSession, ...(record.pendingRetirements ?? [])];
  return [...new Map(references.filter((ref) => ref != null).map((ref) => [ref.sessionStoreId, ref])).values()];
}
