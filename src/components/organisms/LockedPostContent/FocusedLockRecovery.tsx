'use client';

import { usePurchasedLocks } from '@/hooks/usePurchasedLocks/usePurchasedLocks';
import { usePurchaseResume } from '@/hooks/usePurchaseResume/usePurchaseResume';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { FocusedLock } from './FocusedLockContext';

/**
 * Finishes a paid purchase whose bytes never arrived while a post page shows the unlocked article.
 * The post card runs this recovery otherwise, but the page unmounts it as soon as the article's
 * cached text lands, unreadable bytes included.
 */
export function FocusedLockRecovery({ focusedLock }: { focusedLock: FocusedLock }) {
  const { lock } = focusedLock;
  const { lockFile, price } = focusedLock.lockFile;
  const { hasCompleteContent, isResolvingReplica, applyUnlockedContent } = focusedLock.unlocked;
  const { hasPurchase } = usePurchasedLocks({ enabled: price !== null });

  usePurchaseResume({
    lock,
    lockFile,
    isPurchased: hasPurchase(LockContentParser.lockIdFromUrl(lock)),
    hasContent: hasCompleteContent,
    isResolvingContent: isResolvingReplica,
    onResumed: applyUnlockedContent,
  });

  return null;
}
