import type { TLockConfig } from '@/application/locks/locks.types';

export interface DialogLockContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The payment lock was configured. Nothing is published yet — the composer's Post button does that. */
  onApplied: (config: TLockConfig) => void;
}
