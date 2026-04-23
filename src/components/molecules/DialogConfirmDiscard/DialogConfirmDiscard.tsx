'use client';

import * as Atoms from '@/atoms';
import type { DialogConfirmDiscardProps } from './DialogConfirmDiscard.types';
import { Trash2 } from 'lucide-react';
export function DialogConfirmDiscard({ open, onOpenChange, onConfirm }: DialogConfirmDiscardProps) {
  const handleDiscard = () => {
    onConfirm();
    onOpenChange(false);
  };
  const handleCancel = () => {
    onOpenChange(false);
  };
  return (
    <Atoms.Dialog open={open} onOpenChange={onOpenChange}>
      <Atoms.DialogContent className="w-xl" hiddenTitle="Do you want to close it?">
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>Do you want to close it?</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Atoms.Typography className="text-base tracking-wide text-white/80">
          If you do, you will lose the content.
        </Atoms.Typography>
        <Atoms.DialogFooter>
          <Atoms.Button variant="destructive" size="lg" onClick={handleDiscard}>
            <Trash2 className="h-4 w-4" />
            Discard
          </Atoms.Button>
          <Atoms.Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
