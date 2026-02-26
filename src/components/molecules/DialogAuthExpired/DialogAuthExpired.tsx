'use client';

import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import type { DialogAuthExpiredProps } from './DialogAuthExpired.types';

/** Non-dismissible dialog shown when the QR auth session has expired, with a Refresh action. */
export function DialogAuthExpired({ open, onRefresh, isLoading = false }: DialogAuthExpiredProps) {
  const t = useTranslations('onboarding.authExpired');

  return (
    <Atoms.Dialog open={open}>
      <Atoms.DialogContent showCloseButton={false} hiddenTitle={t('title')}>
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Atoms.DialogDescription className="sr-only">{t('description')}</Atoms.DialogDescription>
        <Atoms.Typography className="text-base tracking-wide text-white/80">{t('description')}</Atoms.Typography>
        <Atoms.DialogFooter>
          <Atoms.Button size="lg" onClick={onRefresh} disabled={isLoading}>
            <Libs.RefreshCw className="size-4" />
            {t('refresh')}
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
