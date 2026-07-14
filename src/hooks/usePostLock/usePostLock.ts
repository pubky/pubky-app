'use client';

import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { LockContentParser, LockFileParser } from '@/pipes/locks/locks.parser';
import type { UsePostLockParams, UsePostLockResult } from './usePostLock.types';

/**
 * Reader data for a lock post: parses the teaser content, fetches the lock file,
 * and resolves how the content is gated.
 *
 * @see docs/Locks.md
 * @param content - The post's raw `content` field (stringified teaser JSON).
 * @param lock - The post's top-level `lock` URL (public `lock.json`).
 */
export function usePostLock({ content, lock }: UsePostLockParams): UsePostLockResult {
  const lockContent = LockContentParser.parse(content);
  const { lockFile, hasError } = useLockFile(lock);
  const verifierType = LockFileParser.resolveVerifierType(lockFile);

  return { lockContent, verifierType, hasError };
}
