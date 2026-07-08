'use client';

import { useState } from 'react';

interface UsePostInputLockOptions {
  isEnabled: boolean;
  onSuccess?: (createdPostId: string) => void;
}

interface UsePostInputLockReturn {
  lockSwitch?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
  isLockDialogOpen: boolean;
  closeLockDialog: () => void;
  handleLockPublished: () => void;
}

/**
 * Creator "lock content" toggle for the composer. Turning the switch on opens the Lock Content
 * dialog immediately; the lock flow is self-contained and does not gate the Post submit.
 */
export function usePostInputLock({ isEnabled, onSuccess }: UsePostInputLockOptions): UsePostInputLockReturn {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);

  // Switch on → open the dialog; switch off → close it.
  const onCheckedChange = (checked: boolean) => {
    setLockEnabled(checked);
    setIsLockDialogOpen(checked);
  };

  // Dismissing the dialog without applying reverts the switch (the lock was never configured).
  const closeLockDialog = () => {
    setIsLockDialogOpen(false);
    setLockEnabled(false);
  };

  const handleLockPublished = () => {
    setIsLockDialogOpen(false);
    setLockEnabled(false);
    // Close the compose modal too, like a normal post. Locks has no created post id yet.
    onSuccess?.('');
  };

  return {
    lockSwitch: isEnabled ? { checked: lockEnabled, onCheckedChange } : undefined,
    isLockDialogOpen,
    closeLockDialog,
    handleLockPublished,
  };
}
