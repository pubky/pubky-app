'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

interface DialogConfirmDeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}
export function DialogConfirmDelete({ open, onOpenChange, onConfirm }: DialogConfirmDeleteProps) {
  const t = useTranslations('dialogs.deletePost');
  const handleDelete = () => {
    onConfirm();
    onOpenChange(false);
  };
  const handleCancel = () => {
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-xl" hiddenTitle={t('title')}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <Typography className="text-base tracking-wide text-white/80">{t('description')}</Typography>
        <DialogFooter>
          <Button variant="destructive" size="lg" onClick={handleDelete} data-cy="dialog-confirm-delete-btn">
            <Trash2 className="h-4 w-4" />
            {t('confirmButton')}
          </Button>
          <Button variant="outline" size="lg" onClick={handleCancel}>
            {t('cancelButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
