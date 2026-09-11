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
  /** True while a submission is in flight — locks the primary button. */
  isSubmitting: boolean;
  /** Primary action of `pay` and `install`: starts the payment. */
  onSubmit: () => void;
  /** Restarts a parked wait. */
  onRecheck: () => void;
  /** Reveals the downloaded content from the paid confirmation screen. */
  onViewContent: () => void;
}
