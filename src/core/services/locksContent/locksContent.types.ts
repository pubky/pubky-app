import type { Session as LocksSdkSession } from '@pubky/locks-sdk';

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

/**
 * One unlock criterion.
 *
 * TODO:[Locks] #2040 — Phase 1 ships a `password` verifier, but the Lock Server only registers
 * `dev-static` today, so that placeholder is sent instead — see `LocksContentController`. Drop this
 * note once the password verifier lands and the placeholder is gone.
 */
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

/** Lock-server binding. `override` pins a specific Lock Server pubky; `null` uses the creator default. */
type TLockServer = {
  override: string | null;
};

/** Params to upload one guarded resource (raw bytes). */
export type TRegisterGuardedResourceParams = {
  session: LocksSdkSession;
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
  session: LocksSdkSession;
  /** Entry-point resource: the JSON file holding the `PubkyAppPost` object. Always present. */
  primaryResource: TGuardedResource;
  /** The remaining resources; each descriptor as returned by `registerGuardedResource`. */
  secondaryResources?: TGuardedResource[];
  criteria: TLockCriterion[];
  lockLogic: TLockLogic;
  accessPolicy: TAccessPolicy;
  lockServer: TLockServer;
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
