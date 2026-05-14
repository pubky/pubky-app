'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import type { DialogFeedbackSuccessProps } from './DialogFeedbackSuccess.types';

export function DialogFeedbackSuccess({ onOpenChange }: DialogFeedbackSuccessProps) {
  const t = useTranslations('feedback.success');
  const tCommon = useTranslations('common');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-row justify-end">
        <DialogClose asChild>
          <Button variant="dark-outline" size="lg" onClick={() => onOpenChange(false)} className="rounded-full">
            <Check className="mr-2 h-4 w-4" />
            {tCommon('yourWelcome')}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
