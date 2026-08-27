import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { z } from 'zod';
import { POST_KINDS } from '@/models/models.types';

// ── Creator: auth + publishing ──────────────────────────────────────────────

/** Params to build a `/connect` URL for the Lock-Server-hosted auth shell. */
export type TGenerateConnectUrlParams = {
  /** Parent (pubky-app) origin; the Lock Server targets its postMessage + `frame-ancestors` at it. */
  returnTo: string;
  /** Opaque CSRF value echoed back in the callback for verification. */
  state: string;
};

/** Controller-facing params for the connect URL; `returnTo` is derived inside the controller. */
export type TGetConnectUrlParams = {
  /** Opaque CSRF value echoed back in the callback for verification. */
  state: string;
};

/** Params to build the Paykit `/setup` URL for the creator's payout account. */
export type TGeneratePaykitSetupUrlParams = {
  /** Parent (pubky-app) origin; Paykit targets its postMessage + `frame-ancestors` at it. */
  returnTo: string;
  /** Opaque CSRF value echoed back in the callback for verification. */
  state: string;
};

/** Controller-facing params for the Paykit setup URL; `returnTo` is derived inside the controller. */
export type TGetPaykitSetupUrlParams = {
  /** Opaque CSRF value echoed back in the callback for verification. */
  state: string;
};

/** Params to exchange a one-time callback code for a Locks session. */
export type TExchangeSessionCodeParams = {
  code: string;
  state: string;
};

/**
 * Outcome of `exchangeSessionCode`. `session` is the live SDK object (needed for signout);
 * `secret` is the freshly minted bearer value to persist.
 */
export type TLocksSessionResult = {
  session: LocksSdkSession;
  /** Bearer secret to persist, then pass back to `restoreSession` on reload. */
  secret: string;
};

/**
 * A guarded-resource descriptor. `path` is the FULL homeserver path
 * (`/priv/locks.app/content/<tail>`) and `hash` is the server-computed BLAKE3 (Crockford base32).
 * Returned by `registerGuardedResource` and fed back verbatim into a content lock's resources.
 */
export type TGuardedResource = {
  path: string;
  hash: string;
  content_type: string;
  size: number;
};

/** One unlock criterion. */
type TLockCriterion = {
  criterion_id: string;
  verifier_type: string;
  params: Record<string, unknown>;
};

/** How the criteria combine. Phase 1: `{ type: 'all' }` over the criterion ids. */
type TLockLogic = {
  type: string;
  criteria: string[];
};

/** Access-credential policy (TTL of the credential the reader receives on unlock). */
type TAccessPolicy = {
  requested_credential_ttl_seconds: number;
};

/** Params to upload one guarded resource (raw bytes). */
export type TRegisterGuardedResourceParams = {
  /**
   * The path TAIL only (the caller mints it); the server prepends `/priv/locks.app/content/`.
   * Passing a full path double-prefixes.
   */
  path: string;
  contentType: string;
  bytes: Uint8Array;
};

/** Result of uploading one guarded resource: its descriptor (for the lock) plus the owner pubky. */
export type TRegisterGuardedResourceResult = {
  resource: TGuardedResource;
  /** Owner pubky as returned (with the `pubky` prefix): whoever authenticated to the Lock Server. */
  creator: string;
};

/** Params to bundle uploaded resources into one content lock. At least one resource is required. */
export type TCreateContentLockParams = {
  /** Entry-point resource: the JSON file holding the `PubkyAppPost` object. Always present. */
  primaryResource: TGuardedResource;
  /** The remaining resources; each descriptor as returned by `registerGuardedResource`. */
  secondaryResources?: TGuardedResource[];
  criteria: TLockCriterion[];
  lockLogic: TLockLogic;
  accessPolicy: TAccessPolicy;
};

/**
 * `createContentLock` response (only the fields the FE consumes; the server also echoes the full
 * `content_lock` document). `content_lock_path` is the homeserver path (`/pub/locks.app/<lock_id>.json`)
 * and `creator` owns it — the pubky that authenticated to the Lock Server. This can differ from the
 * pubky.app account, so the announcement's `lock` URL must be built from `creator`, not the app user.
 */
export type TCreateContentLockResult = {
  lock_id: string;
  content_lock_path: string;
  /** Lock owner pubky (as returned, with the `pubky` prefix). Whoever authenticated to the Lock Server. */
  creator: string;
};

// ── Reader: the public lock file (`lock.json`) ──────────────────────────────

/**
 * How a lock's content is gated. Derived from a criterion's `verifier_type`
 * (see `LockFileParser.resolveVerifierType`).
 */
export enum VerifierType {
  PASSWORD = 'password',
  PAYMENT = 'paykit-payment',
}

/** Primary for Lock. The entry-point PubkyAppPost; carries its own `path`. */
interface LockPostResource {
  path: string;
  hash: string;
  content_type: string;
  size: number;
}

/** Secondary for Lock. An attachment, keyed by its path in `secondary_resources`. */
interface LockAttachmentResource {
  hash: string;
  content_type: string;
  size: number;
}

/** A single unlock requirement. `verifier_type` decides how it is satisfied. */
interface LockCriterion {
  criterion_id: string;
  /** Raw verifier kind (e.g. "password", "paykit-payment"); map via `LockFileParser`. */
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
 * TODO:[Locks] locks#22 — replace with the SDK's own type once it exports one.
 */
export interface LockFile {
  version: number;
  creator: string;
  /** The entry-point post. Optional per the contract, but at least one resource is always present. */
  primary_resource?: LockPostResource;
  /** Attachments, keyed by full canonical private path. */
  secondary_resources: Record<string, LockAttachmentResource>;
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

/** Serialized `PubkyAppPost.kind`. Invalid → reject the whole post, no fallback. */
const postKindSchema = z.enum(POST_KINDS);

/** The guarded primary — a `PubkyAppPost` — read back after unlock. Lenient: unknown fields ignored. */
export const guardedPostSchema = z.object({
  content: z.string().catch(''),
  kind: postKindSchema,
  attachments: z.array(z.string()).nullable().default(null), // missing→null; malformed rejects the whole post
});

export type GuardedPost = z.infer<typeof guardedPostSchema>;

/**
 * The reader's own `post.json` written on unlock. Not a `PubkyAppPost`: each attachment carries its
 * `content_type` inline so the replicated copy renders without the creator's lock file — the lock can
 * be revoked, and this file lives entirely in the reader's `/priv`.
 */
export const replicatedPostSchema = z.object({
  content: z.string().catch(''),
  kind: postKindSchema,
  attachments: z
    .array(z.object({ url: z.string(), content_type: z.string() }))
    .nullable()
    .default(null),
});

export type ReplicatedPost = z.infer<typeof replicatedPostSchema>;

export interface TUnlockedListItem {
  lockId: string;
  post: ReplicatedPost;
  /** Homeserver write time of the marker — the unlock time, and the list's sort key. */
  unlockedAt: number;
}

/** One guarded attachment read back after unlock — raw bytes + its content type (for a Blob). */
export interface TUnlockedAttachment {
  /** Guarded path tail (`/priv/locks.app/content/<uuid>` → `<uuid>`); reused as the filename when replicated. */
  id: string;
  contentType: string;
  bytes: Uint8Array;
}

/** The full unlocked content: the parsed post plus its proxy-read attachments (in `attachments` order). */
export interface TUnlockedContent {
  post: GuardedPost;
  attachments: TUnlockedAttachment[];
}

/** Parameters for fetching a lock file from a post's top-level `lock` URL. */
export interface TFetchLockFileParams {
  lockUrl: string;
}

/** A fetched lock file plus how its content is gated (null while missing / unsupported). */
export interface TFetchLockFileResult {
  lockFile: LockFile | null;
  verifierType: VerifierType | null;
  priceSats: string | null;
}

/** One proof for a lock criterion. `payload` is verifier-specific (dev-static: `{ satisfied: true }`). */
export interface TProof {
  criterion_id: string;
  verifier_type: string;
  payload: Record<string, unknown>;
}

/** Reader-built proof bundle submitted to unlock (`Viewer.submitProofBundle`). */
export interface TSubmittedProofBundle {
  version: number;
  bundle_id: string;
  /** Public lock file as `<creator>/pub/locks.app/<lock_id>.json` — no `pubky://` scheme. */
  pubky_lock_resource: string;
  proofs: TProof[];
}

export type TVerificationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';

/** Verification lifecycle state, tracked server-side by `{ creator, bundle_id }`. */
export interface TVerificationTask {
  creator: string;
  bundle_id: string;
  status: TVerificationStatus;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_message: string | null;
}

/** Bearer credential issued after a completed verification; shown once. */
export interface TAccessCredential {
  credential: string;
  expires_at: string;
}

export interface TUnlockResult {
  bundleId: string;
  credential: string;
  expiresAt: string;
}
