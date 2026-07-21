import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { GuardedContentParser, LockContentParser, LockProofBundler } from '@/pipes/locks/locks.parser';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocksService } from '@/services/locks/locks';
import type {
  LockFile,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TFetchLockFileParams,
  TGenerateConnectUrlParams,
  TGuardedResource,
  TLocksSessionResult,
  TRegisterGuardedResourceResult,
  TUnlockedAttachment,
  TUnlockedContent,
  TUnlockResult,
  TVerificationStatus,
} from '@/services/locks/locks.types';
import type {
  TCreateLockContentParams,
  TFetchUnlockedContentParams,
  TLoadReplicatedContentParams,
  TLockContentFile,
  TReplicateUnlockedContentParams,
  TUnlockContentParams,
} from './locks.types';

// Verification polling: check status every interval, up to a bounded number of attempts.
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40;

const isVerifying = (status: TVerificationStatus) => status === 'pending' || status === 'in_progress';

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
 * Application layer for the Lock Server: auth (mirrors `AuthApplication`), publishing locked content
 * (creator), and reading a lock's public `lock.json` (reader).
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

  private static wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reader unlock: mint a bundle id, submit the proof, poll until the Lock Server finishes verifying,
   * then request the access credential.
   */
  static async unlockContent({ lockFile, lockUrl, password }: TUnlockContentParams): Promise<TUnlockResult> {
    const { creator } = lockFile;
    const bundleId = await LocksService.generateBundleId();
    const bundle = LockProofBundler.build(lockFile, lockUrl, bundleId);

    // Submit the proof; the server verifies asynchronously and returns a pending task.
    let task = await LocksService.submitProofBundle(bundle, password);
    // Poll the task status until it's no longer verifying (or the attempt ceiling is hit).
    for (let attempt = 0; isVerifying(task.status) && attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await this.wait(POLL_INTERVAL_MS);
      task = await LocksService.lookupVerificationTask(creator, bundleId);
    }

    if (task.status !== 'completed') {
      throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, `Unlock verification did not complete (${task.status})`, {
        service: ErrorService.Locks,
        operation: 'unlockContent',
        context: { status: task.status, failureMessage: task.failure_message },
      });
    }

    const credential = await LocksService.issueAccessCredential(creator, bundleId);
    return { bundleId, credential: credential.credential, expiresAt: credential.expires_at };
  }

  /** Reads the guarded post + its attachments with the access credential. Returns null when unparseable. */
  static async fetchUnlockedContent({
    lockFile,
    credential,
  }: TFetchUnlockedContentParams): Promise<TUnlockedContent | null> {
    const primaryPath = lockFile.primary_resource?.path;
    const readPath = primaryPath ? GuardedContentParser.toReadPath(primaryPath) : null;
    if (!readPath) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'lock file has no readable primary resource', {
        service: ErrorService.Locks,
        operation: 'fetchUnlockedContent',
        context: { primaryPath },
      });
    }

    const primaryBytes = await LocksService.proxyReadGuardedResource(credential, readPath);
    const post = GuardedContentParser.parsePost(primaryBytes);
    if (!post) return null;

    const attachments = await this.readGuardedAttachments(lockFile, credential, post.attachments ?? []);
    return { post, attachments };
  }

  /**
   * Proxy-reads each attachment, pairing its bytes with the content type from the lock file. One bad
   * attachment is reported and dropped, not fatal — the rest of the post still renders. The caller
   * compares the returned count against the post's attachment count to warn the reader.
   */
  private static async readGuardedAttachments(
    lockFile: LockFile,
    credential: string,
    uris: string[],
  ): Promise<TUnlockedAttachment[]> {
    const reads = await Promise.all(
      uris.map(async (uri) => {
        try {
          const path = GuardedContentParser.attachmentUriToPath(uri);
          const readPath = GuardedContentParser.toReadPath(path);
          const contentType = lockFile.secondary_resources?.[path]?.content_type;
          // No descriptor = a permanent data-integrity error (the bytes live on the owner's HS with no
          // content type, so they can never render). Report to Sentry, then drop this one attachment.
          if (!readPath || !contentType) {
            throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'guarded attachment has no content descriptor', {
              service: ErrorService.Locks,
              operation: 'fetchUnlockedContent',
              context: { path },
            });
          }
          return {
            id: readPath,
            contentType,
            bytes: await LocksService.proxyReadGuardedResource(credential, readPath),
          };
        } catch {
          return null; // already reported (Err factory / service `toAppError`); skip so the rest render
        }
      }),
    );
    return reads.filter((attachment): attachment is TUnlockedAttachment => attachment !== null);
  }

  /**
   * Copies unlocked content into the reader's own `/priv/social/unlocked/<lockId>/`, so re-reading it
   * later needs no credential and survives the creator revoking access.
   *
   * Attachments upload first: `post.json` is the completion marker (§7 reads it to decide whether a
   * lock is already unlocked), so it must land only once everything it references is stored. A partial
   * run therefore leaves no marker and is simply retried on the next unlock.
   */
  static async replicateUnlockedContent({
    lockUrl,
    readerPubky,
    content,
  }: TReplicateUnlockedContentParams): Promise<void> {
    const lockId = LockContentParser.lockIdFromUrl(lockUrl);
    if (!lockId) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'lock URL has no lock id to replicate under', {
        service: ErrorService.Locks,
        operation: 'replicateUnlockedContent',
        context: { lockUrl },
      });
    }

    for (const attachment of content.attachments) {
      await HomeserverService.putBlob({
        url: GuardedContentParser.unlockedUrl(readerPubky, lockId, attachment.id),
        blob: attachment.bytes,
      });
    }

    await HomeserverService.putBlob({
      url: GuardedContentParser.unlockedPostUrl(readerPubky, lockId),
      blob: new TextEncoder().encode(
        GuardedContentParser.buildUnlockedPost(content.post, readerPubky, lockId, content.attachments),
      ),
    });
  }

  /** Already unlocked → load from reader's HS `/priv`. Null if no `post.json` (never unlocked or partial). */
  static async loadReplicatedContent({
    lockUrl,
    readerPubky,
  }: TLoadReplicatedContentParams): Promise<TUnlockedContent | null> {
    const lockId = LockContentParser.lockIdFromUrl(lockUrl);
    if (!lockId) return null;

    // 404 → no marker → not unlocked yet; `getBytesIfExists` returns null quietly (no error log).
    const postBytes = await HomeserverService.getBytesIfExists(
      GuardedContentParser.unlockedPostUrl(readerPubky, lockId),
    );
    if (!postBytes) return null;

    const replicated = GuardedContentParser.parseReplicatedPost(postBytes);
    if (!replicated) return null;

    const refs = replicated.attachments ?? [];
    const attachments = await Promise.all(
      refs.map(async ({ url, content_type }) => ({
        id: url.slice(url.lastIndexOf('/') + 1),
        contentType: content_type,
        bytes: await HomeserverService.getBytes(url),
      })),
    );

    return {
      post: { content: replicated.content, kind: replicated.kind, attachments: refs.map((ref) => ref.url) },
      attachments,
    };
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

  /** Reads the creator's public `lock.json`. Throws for a malformed `lock` URL. */
  static async fetchLockFile({ lockUrl }: TFetchLockFileParams): Promise<LockFile | null> {
    if (!LockContentParser.isValidLockUrl(lockUrl)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'post lock URL is not a valid pubky homeserver URL', {
        service: ErrorService.Locks,
        operation: 'fetchLockFile',
        context: { lockUrl },
      });
    }

    // TODO:[Locks] #2040 — lock-sdk returns `any`; validate with Zod instead of casting.
    return (await LocksService.readContentLock(lockUrl)) as LockFile;
  }
}
