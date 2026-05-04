'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';

import type { DialogReportPostSuccessProps } from './DialogReportPostSuccess.types';
import { Check } from 'lucide-react';
export function DialogReportPostSuccess({ onOpenChange }: DialogReportPostSuccessProps) {
  const t = useTranslations('report.success');
  const tCommon = useTranslations('common');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button
            data-cy="report-success-close"
            variant="dark-outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            aria-label={tCommon('close')}
          >
            <Check className="size-4" aria-hidden="true" />
            {tCommon('yourWelcome')}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
