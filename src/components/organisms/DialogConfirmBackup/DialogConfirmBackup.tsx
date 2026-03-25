'use client';

import { useState } from 'react';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Organisms from '@/organisms';

interface DialogConfirmBackupProps {
  onConfirm?: () => void;
}

export function DialogConfirmBackup({ onConfirm }: DialogConfirmBackupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const { clearSecrets } = Core.useOnboardingStore();

  const handleConfirm = () => {
    clearSecrets();
    setIsOpen(false);
    onConfirm?.();
  };

  const handleBackupMethods = () => {
    setIsOpen(false);
    setIsBackupOpen(true);
  };

  return (
    <>
      <Organisms.DialogBackup open={isBackupOpen} onOpenChange={setIsBackupOpen} />
      <Atoms.Dialog open={isOpen} onOpenChange={setIsOpen}>
        <Atoms.DialogTrigger asChild>
          <Atoms.Button
            id="backup-done-btn"
            variant="secondary"
            className="border bg-card text-xs font-bold text-white shadow-sm"
          >
            Done
          </Atoms.Button>
        </Atoms.DialogTrigger>
        <Atoms.DialogContent className="max-w-sm sm:max-w-xl" hiddenTitle="All backed up?">
          <Atoms.DialogHeader>
            <Atoms.DialogTitle id="backup-done-dialog-title">All backed up?</Atoms.DialogTitle>
            <Atoms.DialogDescription id="backup-done-dialog-description">
              Please confirm if you have completed your preferred backup methods. For your security, the secret seed
              will be be deleted from your browser. You can restore access to your account using your recovery phrase or
              encrypted file.
            </Atoms.DialogDescription>
          </Atoms.DialogHeader>
          <Atoms.Container className="gap-6">
            <Atoms.Container className="flex flex-row items-center gap-3 rounded-md bg-destructive/60 px-6 py-3">
              <Libs.TriangleAlert className="h-4 w-4 font-bold" />
              <Atoms.Typography
                id="backup-done-warning-text"
                size="sm"
                className="font-bold text-destructive-foreground"
              >
                After confirming, your seed will be deleted from the browser (!)
              </Atoms.Typography>
            </Atoms.Container>
          </Atoms.Container>
          <Atoms.DialogFooter>
            <Atoms.Button size="lg" variant="outline" onClick={handleBackupMethods}>
              <Libs.ShieldCheck className="h-4 w-4" />
              Backup methods
            </Atoms.Button>
            <Atoms.Button id="backup-done-confirm-btn" size="lg" onClick={handleConfirm}>
              <Libs.Check className="h-4 w-4" />
              Confirm (delete seed)
            </Atoms.Button>
          </Atoms.DialogFooter>
        </Atoms.DialogContent>
      </Atoms.Dialog>
    </>
  );
}
