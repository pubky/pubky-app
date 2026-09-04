import type { LockFile, TUnlockedContent } from '@/services/locks/locks.types';

/**
 * What the Pay to Unlock modal shows. Two of these exist for safety rather than display:
 * `checking` renders no button until the saved bundle id is resolved, so one already in flight
 * can never look payable again, and `blocked` is where an unreadable saved bundle id lands — paying again
 * could mean paying twice, so it is not offered.
 */
export type TPayToUnlockStage = 'checking' | 'pay' | 'install' | 'waiting' | 'paid' | 'blocked';

export interface UsePayToUnlockParams {
  /** The modal's open state; closed keeps the hook idle (no requests, no polling). */
  open: boolean;
  /** The post's public `lock.json` URL. */
  lockUrl: string;
  /** The fetched lock file; null keeps the hook idle. */
  lockFile: LockFile | null;
  /** Called when the reader chooses View Content after the paid content has been read. */
  onCompleted: (content: TUnlockedContent) => void;
  /** Called with the lock id as soon as a purchase is stored, so other cards see it this session. */
  onPurchased: (lockId: string) => void;
}

export interface UsePayToUnlockResult {
  stage: TPayToUnlockStage;
  /** The wait gave up on its own; only `recheck` moves it forward from here. */
  isStalled: boolean;
  /** True from button press until the submission settles (locks the button). */
  isSubmitting: boolean;
  /** The `pay` / `install` primary action. Reuses a stored bundle id when there is one — minting a
   *  second id for the same lock is how a reader ends up paying twice. */
  submit: () => void;
  /** Resume a parked wait. The purchase was never abandoned, so this only restarts the polling. */
  recheck: () => void;
  /** Reveals content already downloaded for the paid confirmation screen. */
  viewContent: () => void;
}
