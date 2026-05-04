'use client';

import { useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogBackup } from '../DialogBackup/DialogBackup';

import { TriangleAlert, ShieldCheck, Check } from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
interface DialogConfirmBackupProps {
  onConfirm?: () => void;
}
export function DialogConfirmBackup({ onConfirm }: DialogConfirmBackupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const { clearSecrets } = useOnboardingStore();
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
      <DialogBackup open={isBackupOpen} onOpenChange={setIsBackupOpen} />
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            id="backup-done-btn"
            variant="secondary"
            className="border bg-card text-xs font-bold text-white shadow-sm"
          >
            Done
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm sm:max-w-xl" hiddenTitle="All backed up?">
          <DialogHeader>
            <DialogTitle id="backup-done-dialog-title">All backed up?</DialogTitle>
            <DialogDescription id="backup-done-dialog-description">
              Please confirm if you have completed your preferred backup methods. For your security, the secret seed
              will be be deleted from your browser. You can restore access to your account using your recovery phrase or
              encrypted file.
            </DialogDescription>
          </DialogHeader>
          <Container className="gap-6">
            <Container className="flex flex-row items-center gap-3 rounded-md bg-destructive/60 px-6 py-3">
              <TriangleAlert className="h-4 w-4 font-bold" />
              <Typography id="backup-done-warning-text" size="sm" className="font-bold text-destructive-foreground">
                After confirming, your seed will be deleted from the browser (!)
              </Typography>
            </Container>
          </Container>
          <DialogFooter>
            <Button size="lg" variant="outline" onClick={handleBackupMethods}>
              <ShieldCheck className="h-4 w-4" />
              Backup methods
            </Button>
            <Button id="backup-done-confirm-btn" size="lg" onClick={handleConfirm}>
              <Check className="h-4 w-4" />
              Confirm (delete seed)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
