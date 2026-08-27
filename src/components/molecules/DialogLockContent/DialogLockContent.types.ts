import type { TLockConfig } from '@/application/locks/locks.types';

export type LockMethod = 'password' | 'payment';

export interface DialogLockContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The unlock method was chosen. Nothing is published yet — the composer's Post button does that. */
  onApplied: (config: TLockConfig) => void;
}
