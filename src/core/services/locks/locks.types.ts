import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { z } from 'zod';
import { POST_KINDS } from '@/models/models.types';

/** A price in the denomination's smallest unit: sats or USD cents. */
export const lockPriceSchema = z.object({
  asset: z.enum(['BTC', 'USD']),
  amount: z
    .string()
    .refine((value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= BigInt('18446744073709551615')),
});
export type TLockPrice = z.infer<typeof lockPriceSchema>;
export type TLockPriceAsset = TLockPrice['asset'];

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

/**
 * Whether the creator's Paykit payout account is set up, as the Lock Server reports it. `unavailable`
 * means Paykit could not answer, which says nothing about the setup.
 */
const paykitSetupStatusSchema = z.enum(['ready', 'setup_required', 'unavailable']);
export type TPaykitSetupStatus = z.infer<typeof paykitSetupStatusSchema>;

/** Setup-status response (`session.creator.paykitSetupStatus()`, typed `any` by the SDK). */
export const paykitSetupStatusResponseSchema = z.object({ status: paykitSetupStatusSchema });

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
 * (`/priv/app.locks/content/<tail>`) and `hash` is the server-computed BLAKE3 (Crockford base32).
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
   * The path TAIL only (the caller mints it); the server prepends `/priv/app.locks/content/`.
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
 * `content_lock` document). `content_lock_path` is the homeserver path (`/pub/app.locks/<lock_id>.json`)
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
 * Supported verifier types used when creating locks and proof bundles.
 */
export enum VerifierType {
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
  /** Raw verifier kind (currently "paykit-payment"); map via `LockFileParser`. */
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
  override: string | null;
}

/**
 * Mirror of the Lock server's public content-lock contract (`lock.json`), published
 * by the creator at `/pub/app.locks/<lock_id>.json` and read directly by the reader.
 * The Lock server is a standalone service (not pubky.app-specific), so this type
 * belongs to the Lock SDK — hand-mirrored here until that ships a typed reader API.
 * Payment support is read from each criterion's `verifier_type`.
 * TODO:[Locks] locks#22 — replace with the SDK's own type once it exports one.
 */
export interface LockFile {
  version: number;
  creator: string;
  /** The entry-point post. Optional per the contract, but at least one resource is always present. */
  primary_resource?: LockPostResource;
  /** Attachments, keyed by full canonical private path. */
  secondary_resources?: Record<string, LockAttachmentResource>;
  criteria: LockCriterion[];
  lock_logic: LockLogic;
  access_policy: LockAccessPolicy;
  lock_server: LockServer;
}

/**
 * The locked post's kind, saved in the announcement as `content_kind` so the card and the unlock dialog can
 * show what is locked before anyone unlocks it (#2433). These are the pubky-app-specs v1.0.0-rc.1 kind names. They are
 * stored in published posts, so the list is its own and is never derived from the app's internal post kinds:
 * renaming an internal kind must not change what a lock saves. `toLockContentKind` maps one to the other.
 */
// exported for tests
export const LOCK_CONTENT_KINDS = ['note', 'article', 'image', 'video', 'link', 'file'] as const;
export type TLockContentKind = (typeof LOCK_CONTENT_KINDS)[number];

/** Narrows a stored `content_kind` to one this build can show. Anything else is carried raw and shown as generic. */
export function isLockContentKind(kind: string | undefined): kind is TLockContentKind {
  return (LOCK_CONTENT_KINDS as readonly string[]).includes(kind ?? '');
}

/**
 * Creator-authored teaser content stored (stringified) in a lock post's `content`
 * field. FE-owned — pubky-app-specs does not manage it yet, so we validate it at
 * runtime here (Zod).
 * - `lock_title`: title of the locked content (shown in the lock card).
 * - `teaser_description`: preview/announcement text shown above the lock card.
 * - `content_kind` (optional): the locked post's kind, for the card's icon and default title.
 */
export const lockPostContentSchema = z.object({
  lock_title: z.string().catch(''),
  teaser_description: z.string().catch(''),
  // Any string is kept raw, so an edit writes a kind a newer app added back unchanged; only the display narrows
  // it (`getLockContentDisplay`). A non-string reads as unset rather than failing: a failed parse would blank
  // the whole lock post (`LockedPostContent` renders nothing for it).
  content_kind: z.string().optional().catch(undefined),
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
    .array(
      z.object({
        url: z.string(),
        content_type: z.string(),
        /**
         * Position in the locked post's `attachments`, which an article body addresses its images
         * by. Absent on markers written before it was recorded.
         */
        slot: z.number().int().nonnegative().optional().catch(undefined),
      }),
    )
    .nullable()
    .default(null),
  /**
   * Announcement post this was unlocked from. Absent on markers written before it was recorded. A
   * non-pubky value is dropped rather than rejected: it would otherwise parse into a plausible-looking
   * composite id, and failing the whole schema would lose the reader's unlocked content instead.
   */
  announcement: z.string().startsWith('pubky://').optional().catch(undefined),
});

export type ReplicatedPost = z.infer<typeof replicatedPostSchema>;

/**
 * Body of a reader's purchase file: the bundle id a payment was started with. Parsed only from the
 * legacy `/priv/social/purchases/<lockId>.json`; a `<lockId>/<bundleId>.json` file is read by its name.
 */
export const purchaseFileSchema = z.object({ bundle_id: z.string().min(1) });

export interface TUnlockedListItem {
  lockId: string;
  post: ReplicatedPost;
  /** Homeserver write time of the marker — the unlock time, and the list's sort key. */
  unlockedAt: number;
  /** From the marker's `announcement` URI. Absent when it has none, or the URI is unparseable. */
  announcementPostId?: string;
}

/** One guarded attachment read back after unlock — raw bytes + its content type (for a Blob). */
export interface TUnlockedAttachment {
  /** Guarded path tail (`/priv/app.locks/content/<uuid>` → `<uuid>`); reused as the filename when replicated. */
  id: string;
  contentType: string;
  bytes: Uint8Array;
  /** Position in the locked post's `attachments`; a dropped attachment leaves a gap. */
  slot: number;
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

/** A fetched lock file and its validated payment price. */
export interface TFetchLockFileResult {
  lockFile: LockFile | null;
  price: TLockPrice | null;
}

/** One payment proof for a lock criterion. Its verifier payload is currently empty. */
interface TProof {
  criterion_id: string;
  verifier_type: string;
  payload: Record<string, unknown>;
}

/** Reader-built proof bundle submitted to unlock (`Viewer.submitProofBundle`). */
export interface TSubmittedProofBundle {
  version: number;
  bundle_id: string;
  /** Public lock file as `<creator>/pub/app.locks/<lock_id>.json` — no `pubky://` scheme. */
  pubky_lock_resource: string;
  /** Payment bundles only (`pubky` prefix included): where Paykit delivers the payment request. */
  reader_public_key?: string;
  proofs: TProof[];
}

const verificationStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed', 'expired']);
export type TVerificationStatus = z.infer<typeof verificationStatusSchema>;

/**
 * Reader-to-creator Paykit Noise link, read by its own lookup. `blocked` is a policy switch on the
 * reader-creator pair, so a fresh bundle id does not clear it and only an operator can. Not yet
 * discussed with the locks side — raise it there if a reader actually hits it.
 */
const paykitConnectionStateSchema = z.enum(['none', 'handshake', 'connected', 'recovery_required', 'blocked']);
export type TPaykitConnectionState = z.infer<typeof paykitConnectionStateSchema>;

/** Connection-state lookup response. Bound to an existing task, so it says nothing about payment. */
export const paykitConnectionStateResponseSchema = z.object({ state: paykitConnectionStateSchema });

/** Task lookup response fields the app reads. Absent on a Lock Server older than 0.1.0-rc9. */
export const verificationTaskResponseSchema = z.object({
  status: verificationStatusSchema,
  status_message: z.string().nullable().default(null),
  admission_deadline_at: z.string().nullable().default(null),
});

/** Verification lifecycle fields consumed by the app from a task lookup. */
export type TVerificationTask = {
  status: TVerificationStatus;
  /** The server cannot create the invoice until the reader finishes setting up their wallet. */
  walletSetupNeeded: boolean;
  /** RFC 3339 time until which the server keeps trying to create the invoice; null once it exists. */
  admissionDeadlineAt: string | null;
};

/** Proof-submission response fields used by the app. Connection state has its own lookup. */
export const submitProofResultSchema = z.object({
  status: verificationStatusSchema,
});
export type TSubmitProofResult = z.infer<typeof submitProofResultSchema>;

/**
 * What a proof submission came back with: the task's status, or `regionBlocked` when the Lock Server
 * refused with HTTP 451 because paid unlocks are not available in the reader's region. The refusal is
 * a result, not an error, so it is neither logged nor reported.
 */
export type TSubmitProofOutcome = (TSubmitProofResult & { regionBlocked?: false }) | { regionBlocked: true };

/**
 * What a task lookup came back with: the task, null when the server has none for the bundle id, or
 * `regionBlocked` when the Lock Server refused the lookup with HTTP 451. A server that refuses a region
 * does so for its viewer calls alike, so the lookup of a saved bundle id is refused as well.
 */
export type TVerificationLookup = TVerificationTask | null | { regionBlocked: true };

export const isRegionBlockedLookup = (lookup: TVerificationLookup): lookup is { regionBlocked: true } =>
  lookup !== null && 'regionBlocked' in lookup;

/** Bearer credential issued after a completed verification; shown once. */
export interface TAccessCredential {
  credential: string;
  expires_at: string;
}
