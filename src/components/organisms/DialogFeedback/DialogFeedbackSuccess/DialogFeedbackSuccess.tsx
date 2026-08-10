'use client';

import { Check } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import type { DialogFeedbackSuccessProps } from './DialogFeedbackSuccess.types';

export function DialogFeedbackSuccess({ onOpenChange }: DialogFeedbackSuccessProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{'Feedback Received'}</DialogTitle>
        <DialogDescription>{'Thank you for helping us improve Pubky.'}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-row justify-end">
        <DialogClose asChild>
          <Button variant="dark-outline" size="lg" onClick={() => onOpenChange(false)} className="rounded-full">
            <Check className="mr-2 h-4 w-4" />
            {"You're welcome!"}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
