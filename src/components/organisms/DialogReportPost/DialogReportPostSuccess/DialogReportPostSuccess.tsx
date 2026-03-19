'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import type { DialogReportPostSuccessProps } from './DialogReportPostSuccess.types';

export function DialogReportPostSuccess({ onOpenChange }: DialogReportPostSuccessProps) {
  const t = useTranslations('report.success');
  const tCommon = useTranslations('common');

  return (
    <>
      <Atoms.DialogHeader>
        <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
        <Atoms.DialogDescription>{t('description')}</Atoms.DialogDescription>
      </Atoms.DialogHeader>
      <Atoms.DialogFooter>
        <Atoms.DialogClose asChild>
          <Atoms.Button
            data-cy="report-success-close"
            variant="dark-outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            aria-label={tCommon('close')}
          >
            <Libs.Check className="size-4" aria-hidden="true" />
            {tCommon('yourWelcome')}
          </Atoms.Button>
        </Atoms.DialogClose>
      </Atoms.DialogFooter>
    </>
  );
}
