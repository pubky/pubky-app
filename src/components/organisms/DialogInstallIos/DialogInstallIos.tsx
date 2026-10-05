'use client';

import { Check, Share, SquarePlus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

interface DialogInstallIosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user confirmed the steps ("Got it"). */
  onConfirm: () => void;
}

/**
 * DialogInstallIos
 *
 * iOS Safari has no install prompt API, so installing means adding the site to
 * the Home Screen by hand. This dialog walks through the two taps.
 */
export function DialogInstallIos({ open, onOpenChange, onConfirm }: DialogInstallIosProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" hiddenTitle="Install Pubky" centered>
        <DialogHeader>
          <DialogTitle id="install-ios-dialog-title">Install Pubky</DialogTitle>
          <DialogDescription id="install-ios-dialog-description">
            Add Pubky to your Home Screen for quick access.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-3">
          <li className="flex flex-row items-center gap-3 rounded-md bg-card px-4 py-3">
            <Share aria-hidden="true" className="size-4 shrink-0" />
            <Typography size="sm" className="font-medium">
              Tap the Share button in your browser toolbar
            </Typography>
          </li>
          <li className="flex flex-row items-center gap-3 rounded-md bg-card px-4 py-3">
            <SquarePlus aria-hidden="true" className="size-4 shrink-0" />
            <Typography size="sm" className="font-medium">
              {"Tap 'Add to Home Screen'"}
            </Typography>
          </li>
        </ol>
        <DialogFooter>
          <Button id="install-ios-confirm-btn" size="lg" onClick={onConfirm}>
            <Check className="h-4 w-4" />
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
