export type LockMethod = 'password' | 'payment';

export interface DialogLockContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the lock is applied (e.g. to close the dialog + compose modal). */
  onPublished: () => void;
}
