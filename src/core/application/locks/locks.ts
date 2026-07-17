import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksService } from '@/services/locks/locks';
import type {
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TGenerateConnectUrlParams,
  TGuardedResource,
  TLocksSessionResult,
  TRegisterGuardedResourceResult,
} from '@/services/locks/locks.types';
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
 * Application layer for the Lock Server: auth (mirrors `AuthApplication`) and publishing
 * locked content.
 *
 * The auth methods delegate straight to the service — their real orchestration (session persistence,
 * store writes) lives in `LocksController`, since only controllers manage stores (ADR 0004).
 */
export class LocksApplication {
  private constructor() {} // Prevent instantiation

  static generateConnectUrl(params: TGenerateConnectUrlParams): Promise<string> {
    return LocksService.generateConnectUrl(params);
  }

  /** Whether the Lock Server at `origin` is ready to serve — gates the auth flow before the iframe. */
  static isServerReady(origin: string): Promise<boolean> {
    return LocksService.isServerReady(origin);
  }

  static exchangeSessionCode(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    return LocksService.exchangeSessionCode(params);
  }

  static restoreSession(): Promise<LocksSdkSession> {
    return LocksService.restoreSession();
  }

  static signout(): Promise<void> {
    return LocksService.signout();
  }

  static setLockServiceConfig(): Promise<void> {
    return LocksService.setLockServiceConfig();
  }

  /**
   * Publishes one content lock: uploads every attachment, builds the post from their paths, uploads
   * that too, then bundles the lot into one lock. The post becomes the lock's primary resource, the
   * attachments its secondary resources.
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

    return LocksService.createContentLock({
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
    return LocksService.registerGuardedResource({
      path: crypto.randomUUID(),
      contentType,
      bytes,
    });
  }
}
