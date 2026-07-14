import { CreateContentLockRequestBuilder, RegisterGuardedResourceOptions } from '@pubky/locks-sdk';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { ensureLocksSdkReady } from '@/libs/locks/locksSdk';
import type {
  TCreateContentLockParams,
  TCreateContentLockResult,
  TGuardedResource,
  TRegisterGuardedResourceParams,
  TRegisterGuardedResourceResult,
} from './locksContent.types';

/**
 * The SDK reports HTTP failures as `Lock Server request failed with HTTP <status>` and exposes no
 * status field, so the string is the only signal. Parse it here, at the IO boundary, and promote a
 * rejected session to a typed auth error the UI can act on (`category === Auth` → re-authenticate).
 */
function toLocksError(error: unknown, operation: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HTTP 401')) {
    return Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Locks session rejected by the Lock Server', {
      service: ErrorService.Locks,
      operation,
      cause: error,
    });
  }
  return toAppError(error, ErrorService.Locks, operation);
}

/**
 * IO boundary for publishing locked content via the locks-sdk creator API. Every call goes through
 * a live `session` (bound to its Lock Server), so — unlike `LocksAuthService` — this service needs
 * no network config of its own.
 *
 * Two calls compose one lock: N × `registerGuardedResource` (raw bytes per file) then
 * 1 × `createContentLock` (bundles the returned descriptors + unlock rules).
 */
export class LocksContentService {
  private constructor() {} // Prevent instantiation

  /**
   * Uploads one file's raw bytes under `/priv/locks.app/content/<path>` and returns its descriptor
   * ({ path, hash, content_type, size }) plus the owner pubky — the Lock-Server-authenticated account
   * the bytes landed on, which the post needs to reference its attachments by the right host.
   * Re-uploading the same path silently overwrites — the caller mints a fresh path per file so
   * nothing is ever clobbered.
   */
  static async registerGuardedResource({
    session,
    path,
    contentType,
    bytes,
  }: TRegisterGuardedResourceParams): Promise<TRegisterGuardedResourceResult> {
    try {
      await ensureLocksSdkReady();
      // TODO:[Locks] #2040 — same untyped-SDK cast as `createContentLock` below.
      const response = (await session.creator.registerGuardedResource(
        new RegisterGuardedResourceOptions(path, contentType, bytes),
      )) as { creator: string; guarded_resource: TGuardedResource };
      return { resource: response.guarded_resource, creator: response.creator };
    } catch (error) {
      throw toLocksError(error, 'LocksContentService.registerGuardedResource');
    }
  }

  /**
   * Bundles already-uploaded resources into one content lock and returns the lock descriptor
   * (`lock_id`, `content_lock_path`). Validated all-or-nothing: every referenced
   * resource must exist with a matching hash, and size/count limits are enforced here (not at upload).
   *
   * TODO:[Locks] #2039 — orphan cleanup. A failure here leaves the resources uploaded by the
   * preceding `registerGuardedResource` calls on the server, unreferenced.
   * Scenario: 3 of 4 files upload, then this rejects (size/count limit, hash mismatch, malformed
   * body) and the 3 blobs linger under `/priv/locks.app/content/`. Harmless — each path is minted
   * fresh, so no existing lock breaks — but it wastes the creator's private storage. Closing the tab
   * between the two calls has the same effect and no `catch` can cover it.
   * When #2039 lands: best-effort `deleteGuardedResource` per path on a deterministic 4xx or a user
   * cancel. Transient failures (network / 5xx / 401) must retry this call instead of deleting: the
   * uploaded resources are still valid and their hashes unchanged.
   */
  static async createContentLock({
    session,
    primaryResource,
    secondaryResources = [],
    criteria,
    lockLogic,
    accessPolicy,
    lockServer,
  }: TCreateContentLockParams): Promise<TCreateContentLockResult> {
    try {
      await ensureLocksSdkReady();
      // primaryResource is the JSON file holding the `PubkyAppPost` object (the lock's entry point).
      let builder = new CreateContentLockRequestBuilder().primaryResource(primaryResource);
      for (const resource of secondaryResources) {
        builder = builder.secondaryResource(resource);
      }
      const body = builder
        .criteria(criteria)
        .lockLogic(lockLogic)
        .accessPolicy(accessPolicy)
        .lockServer(lockServer)
        .build();

      // TODO:[Locks] #2040 — the SDK declares `Promise<any>` (wasm-bindgen cannot type JSON), so the
      // response shape is asserted here. Delete the cast when the SDK exports typed responses.
      const response = (await session.creator.createContentLock(body)) as {
        lock_id: string;
        content_lock_path: string;
        content_lock: { creator: string };
      };
      return {
        lock_id: response.lock_id,
        content_lock_path: response.content_lock_path,
        creator: response.content_lock.creator,
      };
    } catch (error) {
      throw toLocksError(error, 'LocksContentService.createContentLock');
    }
  }
}
