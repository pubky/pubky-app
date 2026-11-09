import type { LockFile, TUnlockedContent } from '@/services/locks/locks.types';

export interface UsePurchaseResumeParams {
  /** The post's public `lock.json` URL; null keeps the hook idle. */
  lock: string | null | undefined;
  /** The fetched lock file; null keeps the hook idle. */
  lockFile: LockFile | null;
  /** Whether the reader has a bundle id saved for this lock. A boolean so the effect re-runs when the listing lands after the lock file. */
  isPurchased: boolean;
  /** Content already on screen from the replica; saved bundle ids are kept forever, so this stops a re-download on every mount. */
  hasContent: boolean;
  /** Replica read still in flight, so `hasContent: false` only means "not known yet". */
  isResolvingContent: boolean;
  /** Called with the recovered content once it has been read. */
  onResumed: (content: TUnlockedContent) => void;
}

/**
 * Only a running/completed server task permits recovery without starting a new payment.
 * `'recovering'` is `'recoverable'` while the content of a completed purchase is being downloaded:
 * the content is on its way, so the Unlock pill waits instead of offering a second download (#3038).
 */
export type PurchaseResumeStatus = 'checking' | 'recovering' | 'recoverable' | 'none' | 'unknown';
