import { z } from 'zod';

/**
 * How a lock's content is gated. Derived from a criterion's `verifier_type`
 * (see `LockFileParser.resolveVerifierType`).
 */
export enum VerifierType {
  PASSWORD = 'password',
  PAYMENT = 'payment',
}

/** The content a lock guards (the gated resource on the creator's homeserver). */
interface LockGuardedResource {
  path: string;
  hash: string;
  content_type: string;
  size: number;
}

/** A single unlock requirement. `verifier_type` decides how it is satisfied. */
interface LockCriterion {
  criterion_id: string;
  /** Raw verifier kind (e.g. "password", "payment"); map via `LockFileParser`. */
  verifier_type: string;
  params: Record<string, unknown>;
}

/** How the criteria combine, e.g. "all" / "any" of the listed `criterion_id`s. */
interface LockLogic {
  type: string;
  criteria: string[];
}

/** Policy for the credential granted once the lock is satisfied. */
interface LockAccessPolicy {
  requested_credential_ttl_seconds: number;
}

/** Optional override of which lock server verifies the criteria. */
interface LockServer {
  override: string;
}

/**
 * Mirror of the Lock server's public content-lock contract (`lock.json`), published
 * by the creator at `/pub/locks.app/<lock_id>.json` and read directly by the reader.
 * The Lock server is a standalone service (not pubky.app-specific), so this type
 * belongs to the Lock SDK — hand-mirrored here until that ships a typed reader API.
 * The password/payment distinction is read from each criterion's `verifier_type`.
 * TODO:[Locks] #1998 — replace with the Lock SDK's type once available.
 */
export interface LockFile {
  version: number;
  creator: string;
  guarded_resource: LockGuardedResource;
  criteria: LockCriterion[];
  lock_logic: LockLogic;
  access_policy: LockAccessPolicy;
  lock_server: LockServer;
}

/**
 * Creator-authored teaser content stored (stringified) in a lock post's `content`
 * field. FE-owned — pubky-app-specs does not manage it yet, so we validate it at
 * runtime here (Zod).
 * - `lock_title`: title of the locked content (shown in the lock card).
 * - `teaser_description`: preview/announcement text shown above the lock card.
 */
export const lockPostContentSchema = z.object({
  lock_title: z.string().catch(''),
  teaser_description: z.string().catch(''),
});

export type LockPostContent = z.infer<typeof lockPostContentSchema>;

/** Parameters for fetching a lock file from a post's top-level `lock` URL. */
export interface TFetchLockFileParams {
  lockUrl: string;
}
