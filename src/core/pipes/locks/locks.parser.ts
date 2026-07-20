import { isPubkyIdentifier } from '@/libs/utils/utils';
import {
  type GuardedPost,
  guardedPostSchema,
  type LockFile,
  type LockPostContent,
  lockPostContentSchema,
  type TProof,
  type TSubmittedProofBundle,
  VerifierType,
} from '@/services/locks/locks.types';

const GUARDED_CONTENT_PREFIX = '/priv/locks.app/content/';

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
   * The Lock Server that verifies this lock: the lock file's `lock_server.override` when present.
   * Returns null when there is no override — the caller then falls back to the creator's
   * `/pub/locks.app/config.json`.
   *
   * TODO:[Locks] #2003 — the config.json fallback is not built yet. The Lock Server always writes an
   * `override` into the lock file today, so this covers the current cases; add the fallback when a
   * lock without an override can occur.
   */
  static resolveLockServerPubky(lockFile: LockFile | null): string | null {
    const override = lockFile?.lock_server?.override;
    return override ? override : null;
  }
}

/**
 * Builds the reader's proof bundle from a lock file. Pure transform — no IO (ADR-0006).
 */
export class LockProofBundler {
  private constructor() {}

  static build(lockFile: LockFile, lockUrl: string, bundleId: string): TSubmittedProofBundle {
    // TODO:[Locks] #2040 — every criterion is dev-static in Phase 1, so each proof just asserts
    // satisfied; real verifier payloads (password/payment) land with the server verifiers.
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

  /** Parses the guarded primary bytes (a `PubkyAppPost` JSON) into the reader post shape. */
  static parsePost(bytes: Uint8Array): GuardedPost | null {
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
    const result = guardedPostSchema.safeParse(raw);
    return result.success ? result.data : null;
  }
}
