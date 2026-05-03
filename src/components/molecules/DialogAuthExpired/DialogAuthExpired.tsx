'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';

import { RefreshCw } from 'lucide-react';

type DialogAuthExpiredProps = {
  open: boolean;
  onRefresh: () => void;
  isLoading?: boolean;
};

/** Non-dismissible dialog shown when the QR auth session has expired, with a Refresh action. */
export function DialogAuthExpired({ open, onRefresh, isLoading = false }: DialogAuthExpiredProps) {
  const t = useTranslations('onboarding.authExpired');
  const isMobile = useIsMobile();
  const title = isMobile ? t('titleMobile') : t('titleDesktop');
  const description = isMobile ? t('descriptionMobile') : t('descriptionDesktop');
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <Button size="lg" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className="size-4" />
            {t('refresh')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
