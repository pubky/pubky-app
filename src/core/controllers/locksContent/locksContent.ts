import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksContentApplication } from '@/application/locksContent/locksContent';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type {
  TCreateContentLockResult,
  TGuardedResource,
  TRegisterGuardedResourceResult,
} from '@/services/locksContent/locksContent.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type { TCreateLockContentParams, TLockContentFile } from './locksContent.types';

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
 * Publishes locked content. Mirrors `LocksAuthController`.
 *
 * One lock = N uploads + 1 lock: each file's raw bytes go up via `registerGuardedResource`, then the
 * returned descriptors are bundled by `createContentLock`.
 */
export class LocksContentController {
  private constructor() {} // Prevent instantiation

  /**
   * Uploads every attachment, builds the post from their paths, uploads that too, then bundles the
   * lot into one content lock. The post becomes the lock's primary resource, the attachments its
   * secondary resources.
   *
   * Attachments go first because a resource's path only exists once its bytes are uploaded, and the
   * post has to reference them. Uploads are sequential.
   *
   * TODO:[Locks] #2039 — a failure part-way leaves the already-uploaded resources orphaned on the
   * server. See the note on `LocksContentService.createContentLock` for the cleanup rules.
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
    const session = this.requireSession();

    // The guarded bytes land on the Lock-Server-authenticated account, which may differ from the
    // pubky.app user. Capture that owner from the upload response so `buildPost` can reference the
    // attachments by their real host. With no attachments the owner stays undefined and no URIs are built.
    let owner: string | undefined;
    const attachmentResources: TGuardedResource[] = [];
    for (const file of attachments) {
      const uploaded = await this.upload(session, file);
      owner = uploaded.creator;
      attachmentResources.push(uploaded.resource);
    }
    const post = await this.upload(session, buildPost(attachmentResources, owner));

    return LocksContentApplication.createContentLock({
      session,
      primaryResource: post.resource,
      secondaryResources: attachmentResources,
      criteria: [{ criterion_id: CRITERION_ID, verifier_type: VERIFIER_TYPE, params: VERIFIER_PARAMS }],
      lockLogic: { type: 'all', criteria: [CRITERION_ID] },
      accessPolicy: { requested_credential_ttl_seconds: CREDENTIAL_TTL_SECONDS },
      // Pin the lock to the session's Lock Server — the only one holding the bytes we just uploaded.
      // Leaving this null would defer to the creator's default pointer, which can later change.
      lockServer: { override: session.lockServer() },
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
  private static upload(
    session: LocksSdkSession,
    { contentType, bytes }: TLockContentFile,
  ): Promise<TRegisterGuardedResourceResult> {
    return LocksContentApplication.registerGuardedResource({
      session,
      path: crypto.randomUUID(),
      contentType,
      bytes,
    });
  }

  /**
   * The composer gates on the Locks session when the lock switch is flipped, but that is a one-shot
   * check: logging out while the Lock Content dialog is open clears the session before Apply Lock is
   * ever clicked. Re-read it here rather than trusting the gate.
   */
  private static requireSession(): LocksSdkSession {
    const session = useLocksAuthStore.getState().selectLocksSession();
    if (!session) {
      throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'No Locks session; sign into the Lock Server first', {
        service: ErrorService.Locks,
        operation: 'LocksContentController.createLockContent',
      });
    }
    return session;
  }
}
