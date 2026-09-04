import type { ZodType } from 'zod';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isPositiveIntegerString, isPubkyIdentifier, withPubkyPrefix } from '@/libs/utils/utils';
import {
  type GuardedPost,
  guardedPostSchema,
  type LockFile,
  type LockPostContent,
  lockPostContentSchema,
  purchaseFileSchema,
  type ReplicatedPost,
  replicatedPostSchema,
  type TProof,
  type TSubmittedProofBundle,
  VerifierType,
} from '@/services/locks/locks.types';

const GUARDED_CONTENT_PREFIX = '/priv/locks.app/content/';
/** Where a reader keeps its own copy of content it has unlocked. */
const UNLOCKED_PREFIX = '/priv/social/unlocked/';
/** Where a reader keeps each purchase's bundle id; without it the paid content cannot be fetched again. */
const PURCHASES_PREFIX = '/priv/social/purchases/';
/** Uploaded last, so its presence proves every attachment before it succeeded. */
const UNLOCKED_POST_FILE = 'post.json';

/**
 * Parses a lock post's `content` field (a JSON string) into its creator-authored
 * shape. Pure transform — no IO, no side effects (ADR-0006).
 */
export class LockContentParser {
  private constructor() {}

  /**
   * Parse + validate a lock post's `content` (FE-owned schema, via Zod). Returns
   * `null` only when the content is empty or not a JSON object; missing/invalid
   * fields fall back to empty strings so the teaser still renders.
   */
  static parse(content: string): LockPostContent | null {
    if (!content) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return null;
    }

    const result = lockPostContentSchema.safeParse(raw);
    return result.success ? result.data : null;
  }

  /**
   * True when a post's `lock` URL is a usable lock-file location: a `pubky://`
   * URL with a valid pubky-identifier host (the creator's homeserver) pointing at
   * a `.json` file. Guards against malformed `lock` values before any fetch.
   */
  static isValidLockUrl(lockUrl: string): boolean {
    const PUBKY_URL_PREFIX = 'pubky://';
    const LOCK_FILE_EXTENSION = '.json';
    if (!lockUrl.startsWith(PUBKY_URL_PREFIX) || !lockUrl.endsWith(LOCK_FILE_EXTENSION)) return false;
    const host = lockUrl.slice(PUBKY_URL_PREFIX.length).split('/')[0] ?? '';
    return isPubkyIdentifier(host);
  }

  /** `pubky://<creator>/pub/locks.app/<lock_id>.json` → `<lock_id>`. Null when there is no `.json` tail. */
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

  /**
   * Resolve how the lock is gated (password / payment) from its first criterion.
   * Returns `null` for missing or unsupported verifier types (e.g. "dev-static").
   */
  static resolveVerifierType(lockFile: LockFile | null): VerifierType | null {
    const rawVerifierType = lockFile?.criteria?.[0]?.verifier_type;
    if (rawVerifierType === VerifierType.PASSWORD) return VerifierType.PASSWORD;
    if (rawVerifierType === VerifierType.PAYMENT) return VerifierType.PAYMENT;
    return null;
  }

  /**
   * A payment lock's price in sats, or null for any other lock. `params` is untyped and the file is
   * creator-published, so the value is only accepted in the shape the Lock Server's payment verifier
   * requires — a positive integer string.
   */
  static resolvePriceSats(lockFile: LockFile | null): string | null {
    if (this.resolveVerifierType(lockFile) !== VerifierType.PAYMENT) return null;
    const amount = lockFile?.criteria?.[0]?.params?.amount;
    return typeof amount === 'string' && isPositiveIntegerString(amount) ? amount : null;
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

  // TODO:[Locks] #2369 — password and `dev-static` go away here.
  static build(lockFile: LockFile, lockUrl: string, bundleId: string): TSubmittedProofBundle {
    const proofs: TProof[] = lockFile.criteria.map((criterion) => ({
      criterion_id: criterion.criterion_id,
      verifier_type: criterion.verifier_type,
      payload: { satisfied: true },
    }));

    return {
      version: 1,
      bundle_id: bundleId,
      // The server wants the lock file path without the `pubky://` scheme.
      pubky_lock_resource: lockUrl.replace(/^pubky:\/\//, ''),
      proofs,
    };
  }
}

/**
 * Interprets guarded content read back after unlock. Pure — no IO (ADR-0006).
 */
export class GuardedContentParser {
  private constructor() {}

  /** `pubky://<owner>/priv/locks.app/content/img1` → `/priv/locks.app/content/img1`. */
  static attachmentUriToPath(uri: string): string {
    return uri.replace(/^pubky:\/\/[^/]+/, '');
  }

  /** Relative path for `proxyReadGuardedResource`, or null when outside the guarded namespace. */
  static toReadPath(resourcePath: string): string | null {
    return resourcePath.startsWith(GUARDED_CONTENT_PREFIX) ? resourcePath.slice(GUARDED_CONTENT_PREFIX.length) : null;
  }

  /** Reader's own copy of one unlocked file: `pubky://<reader>/priv/social/unlocked/<lockId>/<file>`. */
  static unlockedUrl(readerPubky: string, lockId: string, file: string): string {
    return `pubky://${readerPubky}${UNLOCKED_PREFIX}${lockId}/${file}`;
  }

  /** Reader's unlocked root: `pubky://<reader>/priv/social/unlocked/`. */
  static unlockedRootUrl(readerPubky: string): string {
    return `pubky://${readerPubky}${UNLOCKED_PREFIX}`;
  }

  /**
   * Reader's bundle id file for one lock: `pubky://<reader>/priv/social/purchases/<lockId>.json`.
   * Beside the replica, not inside it, so deleting the replica keeps the bundle id.
   */
  static purchaseUrl(readerPubky: string, lockId: string): string {
    return `pubky://${readerPubky}${PURCHASES_PREFIX}${lockId}.json`;
  }

  /** Reader's purchases root: `pubky://<reader>/priv/social/purchases/`. */
  static purchasesRootUrl(readerPubky: string): string {
    return `pubky://${readerPubky}${PURCHASES_PREFIX}`;
  }

  /**
   * Picks the `<lockId>` out of each purchases-root file URL:
   * `pubky://<reader>/priv/social/purchases/<lockId>.json` → `<lockId>`.
   * Anything else in the directory is ignored rather than guessed at.
   */
  static purchasedLockIds(fileUrls: string[]): string[] {
    const ids: string[] = [];
    for (const url of fileUrls) {
      const start = url.indexOf(PURCHASES_PREFIX);
      if (start === -1) continue;
      if (url.slice(start + PURCHASES_PREFIX.length).includes('/')) continue;
      const lockId = LockContentParser.lockIdFromUrl(url);
      if (lockId) ids.push(lockId);
    }
    return ids;
  }

  /** Body of the purchase file (`{"bundle_id":…}`); `parsePurchaseFile` reads it back. */
  static buildPurchaseFile(bundleId: string): string {
    return JSON.stringify({ bundle_id: bundleId });
  }

  /** Bundle id inside the purchase file, or null when the bytes are unreadable. */
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
   * Picks the `<lockId>` out of each unlocked-root file URL, keeping only completed replicas:
   * ```
   * pubky://<reader>/priv/social/unlocked/<lockIdA>/post.json  ┐
   * pubky://<reader>/priv/social/unlocked/<lockIdA>/img1       ┘ → '<lockIdA>'
   * pubky://<reader>/priv/social/unlocked/<lockIdB>/img1       →   Problem! It will be dropped, because of no post.json
   * ```
   * `post.json` is written last, so its absence means replication stopped midway (docs/locks.md).
   */
  static completedLockIds(fileUrls: string[]): string[] {
    const ids: string[] = [];
    for (const url of fileUrls) {
      const start = url.indexOf(UNLOCKED_PREFIX);
      if (start === -1) continue;
      const segments = url.slice(start + UNLOCKED_PREFIX.length).split('/');
      if (segments.length === 2 && segments[0] && segments[1] === UNLOCKED_POST_FILE) ids.push(segments[0]);
    }
    return ids;
  }

  /** A little helper: the reader's `post.json` URL — the unlock completion marker for a lock. */
  static unlockedPostUrl(readerPubky: string, lockId: string): string {
    return this.unlockedUrl(readerPubky, lockId, UNLOCKED_POST_FILE);
  }

  /**
   * The post to store as the completion marker: the unlocked post with each attachment repointed to
   * the reader's own copy, its `content_type` stored inline so rendering never needs the lock file.
   */
  static buildUnlockedPost(
    post: GuardedPost,
    readerPubky: string,
    lockId: string,
    attachments: Array<{ id: string; contentType: string }>,
  ): string {
    const rewritten = attachments.map(({ id, contentType }) => ({
      url: this.unlockedUrl(readerPubky, lockId, id),
      content_type: contentType,
    }));
    return JSON.stringify({
      content: post.content,
      kind: post.kind,
      attachments: rewritten.length > 0 ? rewritten : null,
    });
  }

  /** Parses the reader's replicated `post.json` bytes. Returns null on bad JSON. */
  static parseReplicatedPost(bytes: Uint8Array): ReplicatedPost | null {
    return this.parseJsonBytes(bytes, replicatedPostSchema);
  }

  /** Parses the guarded primary bytes (a `PubkyAppPost` JSON) into the reader post shape. */
  static parsePost(bytes: Uint8Array): GuardedPost | null {
    return this.parseJsonBytes(bytes, guardedPostSchema);
  }
}
