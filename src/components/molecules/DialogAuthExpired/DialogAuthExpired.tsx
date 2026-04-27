'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import { RefreshCw } from 'lucide-react';
type DialogAuthExpiredProps = {
  open: boolean;
  onRefresh: () => void;
  isLoading?: boolean;
};

/** Non-dismissible dialog shown when the QR auth session has expired, with a Refresh action. */
export function DialogAuthExpired({ open, onRefresh, isLoading = false }: DialogAuthExpiredProps) {
  const t = useTranslations('onboarding.authExpired');
  const isMobile = Hooks.useIsMobile();
  const title = isMobile ? t('titleMobile') : t('titleDesktop');
  const description = isMobile ? t('descriptionMobile') : t('descriptionDesktop');
  return (
    <Atoms.Dialog open={open}>
      <Atoms.DialogContent showCloseButton={false} hiddenTitle={title}>
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{title}</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Atoms.DialogDescription>{description}</Atoms.DialogDescription>
        <Atoms.DialogFooter>
          <Atoms.Button size="lg" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className="size-4" />
            {t('refresh')}
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
