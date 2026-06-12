'use client';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useDeleteAccount } from '@/hooks/useDeleteAccount/useDeleteAccount';

interface DialogDeleteAccountProps {
  isOpen: boolean;
  onOpenChangeAction: (open: boolean) => void;
}
export function DialogDeleteAccount({ isOpen, onOpenChangeAction }: DialogDeleteAccountProps) {
  const t = useTranslations('dialogs.deleteAccount');
  const tCommon = useTranslations('common');
  const { handleDeleteAccount, isDeleting, progress } = useDeleteAccount();

  // Deletion cannot be interrupted, so block dismissal (cancel, X, overlay, Escape) while it runs
  const handleOpenChange = (open: boolean) => {
    if (isDeleting) {
      return;
    }
    onOpenChangeAction(open);
  };
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg" hiddenTitle={t('title')}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <Typography className="text-base leading-6 font-normal tracking-wide text-white/80">
          {t('description')}
        </Typography>
        <DialogFooter>
          <Button
            id="delete-account-confirm-btn"
            variant="destructive"
            size="lg"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="order-1 sm:order-2"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? t('buttonLoading', { progress }) : t('button')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
            className="order-2 sm:order-1"
          >
            {tCommon('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
