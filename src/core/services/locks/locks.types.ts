import type { Session as LocksSdkSession } from '@pubky/locks-sdk';

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

/**
 * One unlock criterion.
 *
 * TODO:[Locks] #2040 — Phase 1 ships a `password` verifier, but the Lock Server only registers
 * `dev-static` today, so that placeholder is sent instead — see the content methods on
 * `LocksController`. Drop this note once the password verifier lands and the placeholder is gone.
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
