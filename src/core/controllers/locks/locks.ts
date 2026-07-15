import { LocksApplication } from '@/application/locks/locks';
import type {
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TGetConnectUrlParams,
  TGuardedResource,
  TLocksSessionResult,
  TRegisterGuardedResourceResult,
} from '@/services/locks/locks.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type { TCreateLockContentParams, TLockContentFile } from './locks.types';

// TODO:[Locks] #2040 — Phase 1 ships the `password` verifier, but the Lock Server does not implement
// one yet: `VerifierType` (locks-core/src/lock_policy.rs) only has `DevStatic`, and unknown verifier
// strings are rejected while parsing, so `password` cannot be sent today. `dev-static` is a
// placeholder that always satisfies — it MUST be replaced (and this constant deleted) before ship.
// Blocked on the Lock Server adding a password verifier.
//
// When it lands: the public lock file (`/pub/locks.app/<lock_id>.json`) carries `criteria[].params`
// verbatim, so the creator's password must never be put there in plaintext.
const CRITERION_ID = 'criterion-1';
const VERIFIER_TYPE = 'dev-static';
const VERIFIER_PARAMS = { satisfied: true };
const CREDENTIAL_TTL_SECONDS = 900;

/**
 * Entry point for the Lock Server: auth (mirrors `AuthController`) and publishing locked content.
 *
 * One lock = N uploads + 1 lock: each file's raw bytes go up via `registerGuardedResource`, then the
 * returned descriptors are bundled by `createContentLock`.
 */
export class LocksController {
  private constructor() {} // Prevent instantiation

  /**
   * Builds the `/connect` URL to load in the iframe auth modal.
   *
   * `returnTo` is the parent origin. There is no navigation to it — the Lock Server uses it to target
   * the `postMessage` and the `frame-ancestors` CSP, so it must be in `allowed_return_origins`.
   */
  static getConnectUrl({ state }: TGetConnectUrlParams): Promise<string> {
    const returnTo = window.location.origin;
    return LocksApplication.generateConnectUrl({ returnTo, state });
  }

  /**
   * Completes auth from a validated callback: exchanges the one-time code for a session and
   * persists it (bearer secret) to the store.
   */
  static async completeAuthFromCallback(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    const result = await LocksApplication.exchangeSessionCode(params);
    useLocksAuthStore.getState().init({ session: result.session, secret: result.secret });
    // Register the creator's default Lock Server pointer in the background on every auth, mirroring
    // the homeserver's post-auth write. Fire-and-forget: a failure must not drop the established
    // session (the pointer write is idempotent and retried on the next auth). Runs after `init` —
    // the service reads the session it just persisted.
    void this.registerLockServiceConfig();
    return result;
  }

  /** Background lock-service-config write; reports failures to Sentry but never drops the session. */
  private static async registerLockServiceConfig(): Promise<void> {
    try {
      await LocksApplication.setLockServiceConfig();
    } catch {
      // Already reported to Sentry by the service Err factory; swallow so the write (idempotent,
      // retried on the next auth) never drops the established session.
    }
  }

  /**
   * Tears down the Locks session as part of unified pubky.app logout: revokes the frontend session on
   * the Lock Server (best-effort) then clears the local store. Invoked from `AuthController` cleanup so
   * one logout drops both the homeserver and Locks sessions.
   */
  static async logout(): Promise<void> {
    const store = useLocksAuthStore.getState();
    if (store.selectLocksSession()) {
      try {
        await LocksApplication.signout();
      } catch {
        // Already reported to Sentry by the service Err factory; swallow so local teardown runs.
      }
    }
    store.reset();
  }

  /**
   * Clears the Locks session locally. Does not call the Lock Server.
   *
   * Call this when the server rejects the session (HTTP 401) — `signout` would be rejected too.
   * Restoring a session makes no network call, so a stale secret keeps the UI looking signed in until
   * the next creator call fails.
   */
  static clearSession(): void {
    useLocksAuthStore.getState().reset();
  }

  /**
   * On app load, rebuilds the live Locks session from the persisted bearer secret.
   * No-op if nothing to restore or a session is already live. A malformed/stale secret is cleared so
   * the UI shows unauthenticated rather than a broken session. Restore is local (no network), so no
   * retry is needed.
   */
  static async restorePersistedLocksSession(): Promise<void> {
    const store = useLocksAuthStore.getState();
    if (!store.selectLocksSessionSecret() || store.selectLocksSession() !== null) return;

    try {
      store.setSession(await LocksApplication.restoreSession());
    } catch {
      // Malformed/stale secret — already reported by the service Err factory; clear it so the UI
      // shows unauthenticated rather than a broken session.
      store.reset();
    }
  }

  /**
   * Uploads every attachment, builds the post from their paths, uploads that too, then bundles the
   * lot into one content lock. The post becomes the lock's primary resource, the attachments its
   * secondary resources.
   *
   * Attachments go first because a resource's path only exists once its bytes are uploaded, and the
   * post has to reference them. Uploads are sequential.
   *
   * TODO:[Locks] #2039 — a failure part-way leaves the already-uploaded resources orphaned on the
   * server. See the note on `LocksService.createContentLock` for the cleanup rules.
   *
   * TODO:[Locks] #2039 — sizes are never checked before uploading. The Lock Server only enforces its
   * limits at `createContentLock` (server config; defaults 10 MB/file, 10 files, 100 MB total), so an
   * oversized file uploads fine and then fails the lock, leaving an orphan. A pre-check here is UX
   * only — the server stays the authority.
   */
  static async createLockContent({
    attachments = [],
    buildPost,
  }: TCreateLockContentParams): Promise<TCreateContentLockResult> {
    // The guarded bytes land on the Lock-Server-authenticated account, which may differ from the
    // pubky.app user. Capture that owner from the upload response so `buildPost` can reference the
    // attachments by their real host. With no attachments the owner stays undefined and no URIs are built.
    let owner: string | undefined;
    const attachmentResources: TGuardedResource[] = [];
    for (const file of attachments) {
      const uploaded = await this.upload(file);
      owner = uploaded.creator;
      attachmentResources.push(uploaded.resource);
    }
    const post = await this.upload(buildPost(attachmentResources, owner));

    return LocksApplication.createContentLock({
      primaryResource: post.resource,
      secondaryResources: attachmentResources,
      criteria: [{ criterion_id: CRITERION_ID, verifier_type: VERIFIER_TYPE, params: VERIFIER_PARAMS }],
      lockLogic: { type: 'all', criteria: [CRITERION_ID] },
      accessPolicy: { requested_credential_ttl_seconds: CREDENTIAL_TTL_SECONDS },
    });
  }

  /**
   * Uploads one file under a freshly minted path and returns its descriptor.
   *
   * The path is a random id, never the original filename: two attachments named `cover.png` would
   * resolve to the same path and the second upload would silently overwrite the first. This mirrors
   * normal posts, where the blob path comes from a spec-generated id and the filename survives only
   * as display metadata on `PubkyAppFile`.
   */
  private static upload({ contentType, bytes }: TLockContentFile): Promise<TRegisterGuardedResourceResult> {
    return LocksApplication.registerGuardedResource({
      path: crypto.randomUUID(),
      contentType,
      bytes,
    });
  }
}
