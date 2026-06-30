import type { LockPostContent, VerifierType } from '@/services/locks/locks.types';

export interface UsePostLockParams {
  /** The post's raw `content` field (stringified teaser JSON). */
  content: string;
  /** The post's top-level `lock` URL (points at the public `lock.json`). */
  lock: string | null | undefined;
}

export interface UsePostLockResult {
  /** Parsed creator-authored teaser content, or null when content isn't valid JSON. */
  lockContent: LockPostContent | null;
  /** How the content is gated (password / payment), or null while loading / unsupported. */
  verifierType: VerifierType | null;
  /** True when the `lock` URL is invalid or the lock-file fetch failed. */
  hasError: boolean;
}
