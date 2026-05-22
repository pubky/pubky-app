'use client';
import { Trash2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import type { DialogConfirmDiscardProps } from './DialogConfirmDiscard.types';

export function DialogConfirmDiscard({ open, onOpenChange, onConfirm }: DialogConfirmDiscardProps) {
  const handleDiscard = () => {
    onConfirm();
    onOpenChange(false);
  };
  const handleCancel = () => {
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-xl" hiddenTitle="Do you want to close it?">
        <DialogHeader>
          <DialogTitle>Do you want to close it?</DialogTitle>
        </DialogHeader>
        <Typography className="text-base tracking-wide text-white/80">If you do, you will lose the content.</Typography>
        <DialogFooter>
          <Button variant="destructive" size="lg" onClick={handleDiscard}>
            <Trash2 className="h-4 w-4" />
            Discard
          </Button>
          <Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
