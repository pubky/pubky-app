'use client';

import { Check } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import type { DialogReportPostSuccessProps } from './DialogReportPostSuccess.types';

export function DialogReportPostSuccess({ onOpenChange }: DialogReportPostSuccessProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{'Report Sent'}</DialogTitle>
        <DialogDescription>{'Your report will be reviewed soon. Thank you.'}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button
            data-cy="report-success-close"
            variant="dark-outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            aria-label={'Close'}
          >
            <Check className="size-4" aria-hidden="true" />
            {"You're welcome!"}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
