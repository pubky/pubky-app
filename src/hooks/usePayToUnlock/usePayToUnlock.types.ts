import type { LockFile, TUnlockedContent } from '@/services/locks/locks.types';

/**
 * What the Pay to Unlock modal shows. Two of these exist for safety rather than display:
 * `checking` renders no button until the saved bundle id is resolved, so one already in flight
 * can never look payable again, and `blocked` is where an unreadable saved bundle id lands — paying again
 * could mean paying twice, so it is not offered. `unopened` is its own stage because the payment
 * succeeded there and only the content download failed: the reader must never be told to go pay.
 */
export type TPayToUnlockStage = 'checking' | 'retry' | 'install' | 'waiting' | 'paid' | 'unopened' | 'blocked';

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
  /** The lock creator's pubky to hand to Bitkit, while the reader has no wallet yet or no Paykit link. */
  handshakePubky: string | null;
  /** A link state the reader cannot fix by waiting or paying — shown as a notice instead of the QR. */
  connectionIssue: 'recovery_required' | 'blocked' | null;
  /** True while the proof submission is in flight. */
  isSubmitting: boolean;
  /** Retries a failed submission, or starts over with a fresh id after a failed/expired payment. */
  retry: () => void;
  /** Resume a parked wait. The purchase was never abandoned, so this only restarts the polling. */
  recheck: () => void;
  /** Reveals content already downloaded for the paid confirmation screen. */
  viewContent: () => void;
}
