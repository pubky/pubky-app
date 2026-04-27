'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import type { DialogFeedbackSuccessProps } from './DialogFeedbackSuccess.types';
import { Check } from 'lucide-react';
export function DialogFeedbackSuccess({ onOpenChange }: DialogFeedbackSuccessProps) {
  const t = useTranslations('feedback.success');
  const tCommon = useTranslations('common');
  return (
    <>
      <Atoms.DialogHeader>
        <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
        <Atoms.DialogDescription>{t('description')}</Atoms.DialogDescription>
      </Atoms.DialogHeader>
      <Atoms.DialogFooter className="flex-row justify-end">
        <Atoms.DialogClose asChild>
          <Atoms.Button variant="dark-outline" size="lg" onClick={() => onOpenChange(false)} className="rounded-full">
            <Check className="mr-2 h-4 w-4" />
            {tCommon('yourWelcome')}
          </Atoms.Button>
        </Atoms.DialogClose>
      </Atoms.DialogFooter>
    </>
  );
}
