import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, isNotFound, isValidationError } from '@/libs/error/error.utils';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { GuardedContentParser, LockContentParser, LockProofBundler } from '@/pipes/locks/locks.parser';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocksService } from '@/services/locks/locks';
import type {
  LockFile,
  ReplicatedPost,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TFetchLockFileParams,
  TGenerateConnectUrlParams,
  TGeneratePaykitSetupUrlParams,
  TGuardedResource,
  TLocksSessionResult,
  TRegisterGuardedResourceResult,
  TUnlockedAttachment,
  TUnlockedContent,
  TUnlockedListItem,
  TUnlockResult,
  TVerificationStatus,
} from '@/services/locks/locks.types';
import type {
  TCreateLockContentParams,
  TFetchOwnContentParams,
  TFetchReplicatedAttachmentsParams,
  TFetchReplicatedContentParams,
  TFetchUnlockedContentParams,
  TFetchUnlockedListParams,
  TLockContentFile,
  TReplicateUnlockedContentParams,
  TUnlockContentParams,
} from './locks.types';

// Verification polling: check status every interval, up to a bounded number of attempts.
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40;

const isVerifying = (status: TVerificationStatus) => status === 'pending' || status === 'in_progress';

// TODO:[Locks] #2369 — password and `dev-static` all go away here.
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

  static generatePaykitSetupUrl(params: TGeneratePaykitSetupUrlParams): string {
    return LocksService.generatePaykitSetupUrl(params);
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
      const failure = {
        service: ErrorService.Locks,
        operation: 'unlockContent',
        context: { status: task.status, failureMessage: task.failure_message },
      };
      if (task.status === 'failed' || task.status === 'expired') {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Unlock verification ${task.status}`, failure);
      }
      // Still `pending`/`in_progress` after the last poll — the server may finish it later.
      throw Err.server(
        ServerErrorCode.SERVICE_UNAVAILABLE,
        `Unlock verification did not complete (${task.status})`,
        failure,
      );
    }

    const credential = await LocksService.issueAccessCredential(creator, bundleId);
    return { bundleId, credential: credential.credential, expiresAt: credential.expires_at };
  }

  /** Reads the guarded post + its attachments with the access credential. Throws when the post is unparseable. */
  static async fetchUnlockedContent({ lockFile, credential }: TFetchUnlockedContentParams): Promise<TUnlockedContent> {
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
    if (!post) {
      // Unlock succeeded but the primary resource isn't a parseable post — a permanent data error, so
      // report it (like a dropped attachment) instead of a silent null the caller can't distinguish.
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'unlocked guarded post is not parseable', {
        service: ErrorService.Locks,
        operation: 'fetchUnlockedContent',
        context: { readPath },
      });
    }

    // Reader path: proxy-read each attachment through the Lock Server with the access credential.
    const readBytes = (path: string) => this.proxyReadAttachment(credential, path);
    const attachments = await this.readAttachments(lockFile, post.attachments ?? [], 'fetchUnlockedContent', readBytes);
    return { post, attachments };
  }

  /** Proxy-reads one attachment: strips the guarded prefix to the relative path the Lock Server expects. */
  private static proxyReadAttachment(credential: string, path: string): Promise<Uint8Array> {
    const readPath = GuardedContentParser.toReadPath(path);
    if (!readPath) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'attachment path is outside the guarded namespace', {
        service: ErrorService.Locks,
        operation: 'fetchUnlockedContent',
        context: { path },
      });
    }
    return LocksService.proxyReadGuardedResource(credential, readPath);
  }

  /**
   * Pairs each attachment's bytes with its content type (from the lock file), reading the bytes via the
   * caller's `readBytes` (reader = proxy-read with a credential; creator = direct read of their own HS).
   * A validation error (permanent data fault) drops only that attachment; any other failure rejects
   * the whole read so no caller persists a partial result — see the catch below.
   *
   * TODO:[Locks] #2374 — a permanently dropped attachment still lets the marker land, so the lock
   * reads as fully unlocked and the attachment is unrecoverable.
   */
  private static async readAttachments(
    lockFile: LockFile,
    uris: string[],
    operation: string,
    readBytes: (path: string, uri: string) => Promise<Uint8Array>,
  ): Promise<TUnlockedAttachment[]> {
    const reads = await Promise.all(
      uris.map(async (uri) => {
        try {
          const path = GuardedContentParser.attachmentUriToPath(uri);
          // TODO:[Locks] locks#10 — bytes come from the homeserver but the type comes from
          // the public `lock.json`, so the two can disagree. Both reads return bytes only today; take
          // the type from the response header once the SDK exposes it.
          const contentType = lockFile.secondary_resources?.[path]?.content_type;
          // No descriptor = a permanent data-integrity error (the bytes live on a HS with no content
          // type, so they can never render). Report to Sentry, then drop this one attachment.
          if (!contentType) {
            throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'guarded attachment has no content descriptor', {
              service: ErrorService.Locks,
              operation,
              context: { path },
            });
          }
          return { id: path.slice(path.lastIndexOf('/') + 1), contentType, bytes: await readBytes(path, uri) };
        } catch (error) {
          // Validation = permanent data error (bad uri / no descriptor / outside namespace), already
          // reported — retrying can't fix it, so drop this attachment and let the rest render.
          if (isAppError(error) && isValidationError(error)) return null;
          // Anything else is a transient `readBytes` failure (the proxy-read / homeserver GET —
          // network, 5xx): rethrow so the fetch fails before `replicateUnlockedContent` writes the
          // `post.json` marker, keeping the unlock retryable.
          throw error;
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

  /**
   * Lists the reader's unlocked content from `/priv/social/unlocked/`, newest unlock first.
   * Only locks whose `post.json` marker exists count — a partial replica has none. A corrupt or
   * concurrently-deleted marker drops that one item so the rest still renders; any other failure
   * rejects the whole list so the caller can retry.
   *
   * TODO:[Locks] #2296 — uncached, so every profile visit re-lists the root and re-GETs each marker.
   * The reader's unlocked content moves to IndexedDB there, which replaces this with a local read.
   */
  static async fetchUnlockedList({ readerPubky }: TFetchUnlockedListParams): Promise<TUnlockedListItem[]> {
    const files = await HomeserverService.listAll({
      baseDirectory: GuardedContentParser.unlockedRootUrl(readerPubky),
    });

    const items = await Promise.all(
      GuardedContentParser.completedLockIds(files).map(async (lockId) => {
        try {
          const replicatedPost = await this.readReplicatedMarker(readerPubky, lockId, 'fetchUnlockedList');
          return replicatedPost ? { lockId, ...replicatedPost } : null;
        } catch (error) {
          // Validation = corrupt marker, already reported — drop this item only.
          // So user will see validated locks but not invalid ones.
          if (isAppError(error) && isValidationError(error)) return null;
          throw error;
        }
      }),
    );

    return items.filter((item): item is TUnlockedListItem => item !== null).sort((a, b) => b.unlockedAt - a.unlockedAt);
  }

  /**
   * Reads + parses a lock's `post.json` unlock marker. Null when absent — never unlocked, partial
   * replica, or deleted meanwhile; `getBytesIfExists` swallows the 404 quietly (no error log).
   * A marker present but corrupt (a 200 with unparseable bytes) is a data error, not "not unlocked" —
   * reported via throw instead of a silent null.
   */
  private static async readReplicatedMarker(
    readerPubky: string,
    lockId: string,
    operation: string,
  ): Promise<{ post: ReplicatedPost; unlockedAt: number } | null> {
    const marker = await HomeserverService.getBytesIfExists(GuardedContentParser.unlockedPostUrl(readerPubky, lockId));
    if (!marker) return null;

    const post = GuardedContentParser.parseReplicatedPost(marker.bytes);
    if (!post) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'replicated post is not parseable', {
        service: ErrorService.Locks,
        operation,
        context: { lockId },
      });
    }
    // The marker is written once, when the unlock completes, so its server-side write time IS the
    // unlock time. 0 when the header is missing, which sorts the item oldest.
    return { post, unlockedAt: marker.modifiedAt ?? 0 };
  }

  /** Already unlocked → load from reader's HS `/priv`. Null if no `post.json` (never unlocked or partial). */
  static async fetchReplicatedContent({
    lockUrl,
    readerPubky,
  }: TFetchReplicatedContentParams): Promise<TUnlockedContent | null> {
    const lockId = LockContentParser.lockIdFromUrl(lockUrl);
    if (!lockId) return null;

    const replicatedPost = await this.readReplicatedMarker(readerPubky, lockId, 'fetchReplicatedContent');
    if (!replicatedPost) return null;

    const { post } = replicatedPost;
    const refs = post.attachments ?? [];
    return {
      post: { content: post.content, kind: post.kind, attachments: refs.map((ref) => ref.url) },
      attachments: await this.fetchReplicatedAttachments({ post }),
    };
  }

  /**
   * Loads the bytes behind a replicated marker's attachments. Split from `fetchReplicatedContent` so
   * the unlocked list, which already holds the markers, can pull media without re-reading them.
   *
   * Missing file (404) → drop it, show the rest. Anything else → throw, so a brief outage does not
   * look like lost media. Same rule as `readAttachments`.
   */
  static async fetchReplicatedAttachments({ post }: TFetchReplicatedAttachmentsParams): Promise<TUnlockedAttachment[]> {
    const reads = await Promise.all(
      (post.attachments ?? []).map(async ({ url, content_type }) => {
        try {
          return {
            id: url.slice(url.lastIndexOf('/') + 1),
            contentType: content_type,
            bytes: await HomeserverService.getBytes(url),
          };
        } catch (error) {
          // 404 = the replica lost this file; `getBytes` already reported it.
          if (isAppError(error) && isNotFound(error)) return null;
          throw error;
        }
      }),
    );
    return reads.filter((attachment): attachment is TUnlockedAttachment => attachment !== null);
  }

  /**
   * Creator reads their OWN locked content straight from their homeserver
   * (`/priv/locks.app/content/`) — no unlock, no credential, no replication.
   * Only valid when the lock owner is the signed-in account (a == b); the caller
   * verifies that before calling.
   */
  static async fetchOwnContent({ lockFile }: TFetchOwnContentParams): Promise<TUnlockedContent> {
    const primaryPath = lockFile.primary_resource?.path;
    if (!primaryPath) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'lock file has no readable primary resource', {
        service: ErrorService.Locks,
        operation: 'fetchOwnContent',
        context: { primaryPath },
      });
    }

    const owner = stripPubkyPrefix(lockFile.creator);
    const post = GuardedContentParser.parsePost(await HomeserverService.getBytes(`pubky://${owner}${primaryPath}`));
    if (!post) {
      // 200 but unparseable — the creator's own guarded original is corrupt. Report, don't return null.
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'own guarded post is not parseable', {
        service: ErrorService.Locks,
        operation: 'fetchOwnContent',
        context: { owner, primaryPath },
      });
    }

    // Creator path: the guarded original lives on their own HS, so read each attachment URI directly.
    const attachments = await this.readAttachments(lockFile, post.attachments ?? [], 'fetchOwnContent', (_path, uri) =>
      HomeserverService.getBytes(uri),
    );
    return { post, attachments };
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

    return (await LocksService.readContentLock(lockUrl)) as LockFile;
  }
}
