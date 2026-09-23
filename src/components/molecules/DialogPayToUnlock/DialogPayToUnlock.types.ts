import type { TPayToUnlockStage } from '@/hooks/usePayToUnlock/usePayToUnlock.types';

export interface DialogPayToUnlockProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creator-typed lock title, shown in the header card. */
  lockTitle: string;
  /** Post author — the avatar beside the title links to their profile. */
  authorId: string;
  /** Price in sats (wire string), from the lock file's payment criterion. */
  priceSats: string;
  stage: TPayToUnlockStage;
  /** Waiting stage: polling parked on its deadline, so the reader is offered a manual re-check. */
  isStalled: boolean;
  /** Creator pubky to hand to Bitkit — a QR on desktop, the Pay with Bitkit button on mobile; null hides it. */
  handshakePubky: string | null;
  /** Waiting stage: a wallet-link state the reader cannot fix here — replaces the QR with a notice. */
  connectionIssue: 'recovery_required' | 'blocked' | null;
  /** True while the install screen's wallet check or a submission is in flight — locks the primary button, and
   * outside the install screen makes a close ask first. */
  isSubmitting: boolean;
  /** Install screen: re-checks the wallet, then submits. Retry screen: submits again (a fresh id after a failed/expired payment). */
  onRetry: () => void;
  /** Restarts a parked wait. */
  onRecheck: () => void;
  /** Reveals the downloaded content from the paid confirmation screen. */
  onViewContent: () => void;
}
