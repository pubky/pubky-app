import { isOneOf, postKinds, tryDecodeObject } from 'pubky-social-specs';
import type { ZodType } from 'zod';
import {
  APP_LOCKS_PURCHASES_PATH,
  APP_LOCKS_UNLOCKED_PATH,
  SOCIAL_LOCKS_PURCHASES_PATH,
  SOCIAL_LOCKS_UNLOCKED_PATH,
} from '@/config/app-files';
import { LOCKS_GUARDED_CONTENT_PATH } from '@/config/locks';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { parseLockTeaserContent } from '@/libs/post/lockTeaser';
import { isPubkyIdentifier, withPubkyPrefix } from '@/libs/utils/utils';
import { toLocalPostKind } from '@/pipes/post/post.kind';
import {
  type GuardedPost,
  guardedPostSchema,
  type LockFile,
  type LockPostContent,
  lockPriceSchema,
  purchaseFileSchema,
  type ReplicatedPost,
  replicatedPostSchema,
  type TLockPrice,
  type TSubmittedProofBundle,
  VerifierType,
} from '@/services/locks/locks.types';

/** Where a reader keeps its own copy of content it has unlocked. */
const UNLOCKED_PREFIX = APP_LOCKS_UNLOCKED_PATH;
/** Where a reader keeps each purchase's bundle id; without it the paid content cannot be fetched again. */
const PURCHASES_PREFIX = APP_LOCKS_PURCHASES_PATH;
/** Where builds before #3206 kept the same files. Read, never written; removed in #3207. */
const SOCIAL_UNLOCKED_PREFIX = SOCIAL_LOCKS_UNLOCKED_PATH;
const SOCIAL_PURCHASES_PREFIX = SOCIAL_LOCKS_PURCHASES_PATH;
/**
 * `BundleId.generate()`: 16 bytes as uppercase Crockford base32. A pipe cannot load the WASM SDK's
 * `new BundleId()`, so this is the only check that a file name under the purchases root is an id.
 */
const BUNDLE_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** Uploaded last, so its presence proves every attachment before it succeeded. */
const UNLOCKED_POST_FILE = 'post.json';

/**
 * Parses a lock post's `content` field (a JSON string) into its creator-authored
 * shape. Pure transform — no IO, no side effects (ADR-0006).
 */
export class LockContentParser {
  private constructor() {}

  /** Null when the content is empty, not a JSON object, or has neither envelope field. */
  static parse(content: string): LockPostContent | null {
    return parseLockTeaserContent(content);
  }

  /**
   * True when a post's `lock` URL is a usable lock-file location: a `pubky://`
   * URL with a valid pubky-identifier host (the creator's homeserver) pointing at
   * a `.json` file. Guards against malformed `lock` values before any fetch.
   */
  static isValidLockUrl(lockUrl: string): boolean {
    return lockUrl.endsWith('.json') && (this.creatorFromUrl(lockUrl) ?? '') !== '';
  }

  static creatorFromUrl(lockUrl: string): string | null {
    const host = lockUrl.match(/^pubky:\/\/([^/]+)/)?.[1];
    return host && isPubkyIdentifier(host) ? host : null;
  }

  /** `pubky://<creator>/pub/app.locks/<lock_id>.json` → `<lock_id>`. Null when there is no `.json` tail. */
  static lockIdFromUrl(lockUrl: string): string | null {
    const file = lockUrl.split('/').pop() ?? '';
    return file.endsWith('.json') ? file.slice(0, -'.json'.length) || null : null;
  }
}

/**
 * Interprets a fetched `lock.json`. Pure transform — no IO (ADR-0006).
 */
export class LockFileParser {
  private constructor() {}

  /** Validated price from the creator-published payment criterion. */
  static resolvePrice(lockFile: LockFile | null): TLockPrice | null {
    if (lockFile?.criteria?.[0]?.verifier_type !== VerifierType.PAYMENT) return null;
    const price = lockPriceSchema.safeParse(lockFile.criteria[0].params);
    return price.success ? price.data : null;
  }
}

/**
 * Builds the reader's proof bundle from a lock file. Pure transform — no IO (ADR-0006).
 */
export class LockProofBundler {
  private constructor() {}

  /**
   * Payment bundle: exactly one proof with an empty payload, plus the reader's pubky at the top
   * level — Paykit resolves the payment-request delivery address from it. Resubmitting the exact
   * same bundle is a safe replay; any variation returns `409 task_state_conflict`, so it must be
   * built deterministically from the same inputs every time.
   */
  static buildPayment(
    lockFile: LockFile,
    lockUrl: string,
    bundleId: string,
    readerPubky: string,
  ): TSubmittedProofBundle {
    const criterionId = lockFile.criteria[0]?.criterion_id;
    if (!criterionId) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'payment lock file has no criterion', {
        service: ErrorService.Locks,
        operation: 'LockProofBundler.buildPayment',
        context: { lockUrl },
      });
    }
    return {
      version: 1,
      bundle_id: bundleId,
      pubky_lock_resource: lockUrl.replace(/^pubky:\/\//, ''),
      reader_public_key: withPubkyPrefix(readerPubky),
      proofs: [{ criterion_id: criterionId, verifier_type: VerifierType.PAYMENT, payload: {} }],
    };
  }
}

/**
 * Interprets guarded content read back after unlock. Pure — no IO (ADR-0006).
 */
export class GuardedContentParser {
  private constructor() {}

  /** `pubky://<owner>/priv/app.locks/content/img1` → `/priv/app.locks/content/img1`. */
  static attachmentUriToPath(uri: string): string {
    return uri.replace(/^pubky:\/\/[^/]+/, '');
  }

  /** Keep only attachment references in IndexedDB; media bytes stay on the homeserver. */
  static toCachedPost(post: GuardedPost, resources?: Record<string, { content_type: string }>): ReplicatedPost | null {
    const refs: NonNullable<ReplicatedPost['attachments']> = [];
    for (const url of post.attachments ?? []) {
      const contentType = resources?.[this.attachmentUriToPath(url)]?.content_type;
      if (!contentType) return null;
      refs.push({ url, content_type: contentType });
    }
    return { content: post.content, kind: post.kind, attachments: refs.length ? refs : null };
  }

  /** Relative path for `proxyReadGuardedResource`, or null when outside the guarded namespace. */
  static toReadPath(resourcePath: string): string | null {
    return resourcePath.startsWith(LOCKS_GUARDED_CONTENT_PATH)
      ? resourcePath.slice(LOCKS_GUARDED_CONTENT_PATH.length)
      : null;
  }

  /** Reader's own copy of one unlocked file: `pubky://<reader>/priv/app.pubky/v1/locks/unlocked/<lockId>/<file>`. */
  static unlockedUrl(readerPubky: string, lockId: string, file: string): string {
    return `pubky://${readerPubky}${UNLOCKED_PREFIX}${lockId}/${file}`;
  }

  /** Reader's unlocked root: `pubky://<reader>/priv/app.pubky/v1/locks/unlocked/`. */
  static unlockedRootUrl(readerPubky: string): string {
    return `pubky://${readerPubky}${UNLOCKED_PREFIX}`;
  }

  /** The unlocked root of builds before #3206: `pubky://<reader>/priv/social/unlocked/`. */
  static socialUnlockedRootUrl(readerPubky: string): string {
    return `pubky://${readerPubky}${SOCIAL_UNLOCKED_PREFIX}`;
  }

  /** A replica's `post.json` under the root of builds before #3206. */
  static socialUnlockedPostUrl(readerPubky: string, lockId: string): string {
    return `pubky://${readerPubky}${SOCIAL_UNLOCKED_PREFIX}${lockId}/${UNLOCKED_POST_FILE}`;
  }

  /**
   * One file per bundle id: `pubky://<reader>/priv/app.pubky/v1/locks/purchases/<lockId>/<bundleId>.json`.
   * Beside the replica, not inside it, so deleting the replica keeps the bundle id. A file per id, not
   * one per lock: two devices minting at once must not overwrite each other (#2827).
   */
  static purchaseUrl(readerPubky: string, lockId: string, bundleId: string): string {
    return `pubky://${readerPubky}${PURCHASES_PREFIX}${lockId}/${bundleId}.json`;
  }

  /** A bundle id's file under the root of builds before #3206. */
  static socialPurchaseUrl(readerPubky: string, lockId: string, bundleId: string): string {
    return `pubky://${readerPubky}${SOCIAL_PURCHASES_PREFIX}${lockId}/${bundleId}.json`;
  }

  /** Where builds before #2827 kept the one bundle id of a lock, under the social root. Read, never written. */
  static legacyPurchaseUrl(readerPubky: string, lockId: string): string {
    return `pubky://${readerPubky}${SOCIAL_PURCHASES_PREFIX}${lockId}.json`;
  }

  /** One lock's purchase files: `pubky://<reader>/priv/app.pubky/v1/locks/purchases/<lockId>/`. */
  static purchaseLockRootUrl(readerPubky: string, lockId: string): string {
    return `pubky://${readerPubky}${PURCHASES_PREFIX}${lockId}/`;
  }

  /** One lock's purchase files under the root of builds before #3206. */
  static socialPurchaseLockRootUrl(readerPubky: string, lockId: string): string {
    return `pubky://${readerPubky}${SOCIAL_PURCHASES_PREFIX}${lockId}/`;
  }

  /** Reader's purchases root: `pubky://<reader>/priv/app.pubky/v1/locks/purchases/`. */
  static purchasesRootUrl(readerPubky: string): string {
    return `pubky://${readerPubky}${PURCHASES_PREFIX}`;
  }

  /** The purchases root of builds before #3206: `pubky://<reader>/priv/social/purchases/`. */
  static socialPurchasesRootUrl(readerPubky: string): string {
    return `pubky://${readerPubky}${SOCIAL_PURCHASES_PREFIX}`;
  }

  /**
   * Picks the `<lockId>` out of each purchases-root file URL, under either root and in both layouts:
   * `…/purchases/<lockId>/<bundleId>.json` and the legacy `…/purchases/<lockId>.json`.
   * Anything else in the directory is ignored rather than guessed at.
   */
  static purchasedLockIds(fileUrls: string[]): string[] {
    const ids = new Set<string>();
    for (const url of fileUrls) {
      const file = this.purchaseFile(url);
      if (file) ids.add(file.lockId);
    }
    return [...ids];
  }

  /** The purchase files under either purchases root, by layout; a file in neither layout is left out. */
  static purchaseFiles(fileUrls: string[]): {
    bundles: Array<{ lockId: string; bundleId: string }>;
    legacyLockIds: string[];
  } {
    const bundles: Array<{ lockId: string; bundleId: string }> = [];
    const legacyLockIds: string[] = [];
    for (const url of fileUrls) {
      const file = this.purchaseFile(url);
      if (!file) continue;
      if (file.bundleId) bundles.push({ lockId: file.lockId, bundleId: file.bundleId });
      else legacyLockIds.push(file.lockId);
    }
    return { bundles, legacyLockIds };
  }

  /**
   * One purchases-root file: `<lockId>/<bundleId>.json`, or the legacy `<lockId>.json` (no `bundleId`).
   * Null outside both roots or in neither layout.
   */
  private static purchaseFile(url: string): { lockId: string; bundleId: string | null } | null {
    const segments = this.purchaseSegments(url);
    if (!segments) return null;
    if (segments.length === 1) {
      const lockId = LockContentParser.lockIdFromUrl(url);
      return lockId ? { lockId, bundleId: null } : null;
    }
    const bundleId = segments.length === 2 && segments[0] ? this.bundleIdFromFile(segments[1]) : null;
    return bundleId ? { lockId: segments[0], bundleId } : null;
  }

  /** Whether `value` has the shape `BundleId.generate()` produces. */
  static isBundleId(value: string): boolean {
    return BUNDLE_ID_PATTERN.test(value);
  }

  /**
   * The bundle ids under one lock's purchase root, sorted so every device ranks them the same way.
   * Null when any file there is not `<bundleId>.json`: it may hold an id in a format this build does
   * not know (an SDK change), and skipping it could mint and pay a second time.
   */
  static purchaseBundleIds(fileUrls: string[]): string[] | null {
    const ids = new Set<string>();
    for (const url of fileUrls) {
      const segments = this.purchaseSegments(url);
      const bundleId = segments?.length === 2 ? this.bundleIdFromFile(segments[1]) : null;
      if (!bundleId) return null;
      ids.add(bundleId);
    }
    return [...ids].sort();
  }

  /** The path segments after either purchases root, or null when the URL is outside both. */
  private static purchaseSegments(url: string): string[] | null {
    return this.segmentsAfter(url, PURCHASES_PREFIX) ?? this.segmentsAfter(url, SOCIAL_PURCHASES_PREFIX);
  }

  private static segmentsAfter(url: string, prefix: string): string[] | null {
    const start = url.indexOf(prefix);
    return start === -1 ? null : url.slice(start + prefix.length).split('/');
  }

  /** `<bundleId>.json` → `<bundleId>`, or null when the name is not a bundle id. */
  private static bundleIdFromFile(file: string): string | null {
    const bundleId = LockContentParser.lockIdFromUrl(file);
    return bundleId && BUNDLE_ID_PATTERN.test(bundleId) ? bundleId : null;
  }

  /** Body of the purchase file (`{"bundle_id":…}`); `parsePurchaseFile` reads the legacy one back. */
  static buildPurchaseFile(bundleId: string): string {
    return JSON.stringify({ bundle_id: bundleId });
  }

  /** Bundle id inside a legacy purchase file, or null when the bytes are unreadable. */
  static parsePurchaseFile(bytes: Uint8Array): string | null {
    return this.parseJsonBytes(bytes, purchaseFileSchema)?.bundle_id ?? null;
  }

  private static parseJsonBytes<T>(bytes: Uint8Array, schema: ZodType<T>): T | null {
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  }

  /**
   * Picks the `<lockId>` out of each unlocked-root file URL (either root), keeping only completed replicas:
   * ```
   * pubky://<reader>/priv/app.pubky/v1/locks/unlocked/<lockIdA>/post.json  ┐
   * pubky://<reader>/priv/app.pubky/v1/locks/unlocked/<lockIdA>/img1       ┘ → '<lockIdA>'
   * pubky://<reader>/priv/app.pubky/v1/locks/unlocked/<lockIdB>/img1       →   dropped: no post.json
   * ```
   * `post.json` is written last, so its absence means replication stopped midway (docs/locks.md).
   */
  static completedLockIds(fileUrls: string[]): string[] {
    const ids: string[] = [];
    for (const url of fileUrls) {
      const segments = this.segmentsAfter(url, UNLOCKED_PREFIX) ?? this.segmentsAfter(url, SOCIAL_UNLOCKED_PREFIX);
      if (segments?.length === 2 && segments[0] && segments[1] === UNLOCKED_POST_FILE) ids.push(segments[0]);
    }
    return ids;
  }

  /**
   * The replica a copy from the social root writes (#3206), and the files it must copy first: each
   * attachment of this lock under the social root moves to the same name under the new root. An
   * attachment URL outside it is kept as it is. `unlockedAt` is the source marker's unlock time: the
   * copy's own write time is not when the reader unlocked it, and the list sorts by it.
   */
  static toCopiedReplica(
    post: ReplicatedPost,
    readerPubky: string,
    lockId: string,
    unlockedAt: number,
  ): { post: ReplicatedPost; files: Array<{ from: string; to: string }> } {
    const sourcePrefix = `pubky://${readerPubky}${SOCIAL_UNLOCKED_PREFIX}${lockId}/`;
    const files: Array<{ from: string; to: string }> = [];
    const attachments = post.attachments?.map((ref) => {
      const file = ref.url.startsWith(sourcePrefix) ? ref.url.slice(sourcePrefix.length) : '';
      // An attachment named like the marker would land at the marker's path and read as a copy already made.
      if (!file || file.includes('/') || file === UNLOCKED_POST_FILE) return ref;
      const to = this.unlockedUrl(readerPubky, lockId, file);
      files.push({ from: ref.url, to });
      return { ...ref, url: to };
    });
    return {
      post: { ...post, attachments: attachments ?? null, unlocked_at: unlockedAt },
      files,
    };
  }

  /** A little helper: the reader's `post.json` URL — the unlock completion marker for a lock. */
  static unlockedPostUrl(readerPubky: string, lockId: string): string {
    return this.unlockedUrl(readerPubky, lockId, UNLOCKED_POST_FILE);
  }

  /**
   * The post to store as the completion marker: the unlocked post with each attachment repointed to
   * the reader's own copy, its `content_type` stored inline so rendering never needs the lock file.
   */
  static buildReplicatedPost(
    post: GuardedPost,
    readerPubky: string,
    lockId: string,
    attachments: Array<{ id: string; contentType: string; slot: number }>,
    announcementUri: string,
  ): ReplicatedPost {
    const rewritten = attachments.map(({ id, contentType, slot }) => ({
      url: this.unlockedUrl(readerPubky, lockId, id),
      content_type: contentType,
      slot,
    }));
    return {
      content: post.content,
      kind: post.kind,
      attachments: rewritten.length > 0 ? rewritten : null,
      announcement: announcementUri,
    };
  }

  /** Parses the reader's replicated `post.json` bytes. Returns null on bad JSON. */
  static parseReplicatedPost(bytes: Uint8Array): ReplicatedPost | null {
    return this.parseJsonBytes(bytes, replicatedPostSchema);
  }

  /**
   * Parses the guarded primary bytes into the reader post shape: a v1 post (`GuardedPostBuilder`),
   * or the 0.x post a primary written before the social v1 port holds. A 0.x post with no
   * `attachments` member also decodes as a v1 post, of a kind this version does not know, so the
   * kind tells the two apart; the kind comes back in the local vocabulary either way.
   */
  static parsePost(bytes: Uint8Array): GuardedPost | null {
    const read = tryDecodeObject({ kind: 'post', root: 'private' }, bytes);
    if (!read.ok || !isOneOf(postKinds, read.value.kind)) return this.parseJsonBytes(bytes, guardedPostSchema);
    const { content, kind, attachments } = read.value;
    return {
      content,
      kind: toLocalPostKind(kind),
      attachments: attachments.length > 0 ? attachments.map(({ uri }) => uri) : null,
    };
  }
}
