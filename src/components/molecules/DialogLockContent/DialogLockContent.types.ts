import type { RefObject } from 'react';
import type { TLockConfig } from '@/application/locks/locks.types';

export interface DialogLockContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The payment lock was configured. Nothing is published yet — the composer's Post button does that. */
  onApplied: (config: TLockConfig) => void;
  /** The applied price, filled in when the dialog reopens to change it. Null for a new lock. */
  appliedPrice?: TLockConfig | null;
  /** Receives focus when Apply Lock closes the dialog. Cancel still returns focus to where it was. */
  focusAfterApplyRef?: RefObject<HTMLElement | null>;
}
