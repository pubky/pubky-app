import type { UsePurchasedLocksResult } from '@/hooks/usePurchasedLocks/usePurchasedLocks.types';
import type { PurchaseResumeStatus } from '@/hooks/usePurchaseResume/usePurchaseResume.types';

export interface UseUnlockPillHoldParams {
  /** The post's public `lock.json` URL; with the reader's pubky it names the hold. */
  lock: string | null | undefined;
  /** Someone else's lock with a readable price: the only card that offers Unlock. */
  isPayableReader: boolean;
  /** The pay dialog is open. It owns the purchase then, and the pill counts as released. */
  isPayOpen: boolean;
  /** `useUnlockedContent`: the read of the reader's replicated copy (or the restore it waits for) is running. */
  isResolvingReplica: boolean;
  /** `usePurchasedLocks`: whether the reader's list of saved purchases is in. */
  purchasesStatus: UsePurchasedLocksResult['status'];
  /** The purchase list names this lock. */
  isListedPurchase: boolean;
  /**
   * `usePurchaseResume`: `'checking'` while a listed purchase whose copy was not found is looked up, then
   * `'recovering'` while a completed one is downloaded.
   */
  purchaseStatus: PurchaseResumeStatus;
}
