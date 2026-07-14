import { isPubkyIdentifier } from '@/libs/utils/utils';
import { type LockFile, type LockPostContent, lockPostContentSchema, VerifierType } from '@/services/locks/locks.types';

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
}
