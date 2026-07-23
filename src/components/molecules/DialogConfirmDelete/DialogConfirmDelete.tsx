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
  /**
   * Override the i18n namespace to swap copy without forking the dialog.
   * Defaults to `dialogs.deletePost`; collections pass `dialogs.deleteCollection`.
   * The namespace must expose `title`, `description`, `confirmButton`, `cancelButton` keys.
   */
  i18nNamespace?: 'dialogs.deletePost' | 'dialogs.deleteCollection';
  /** When set, replaces the namespace `description` string (e.g. after caller-side interpolation). */
  description?: string;
}
export function DialogConfirmDelete({
  open,
  onOpenChange,
  onConfirm,
  i18nNamespace = 'dialogs.deletePost',
  description,
}: DialogConfirmDeleteProps) {
  const t = useTranslations(i18nNamespace);
  const dialogDescription = description ?? t('description');
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
        <Typography className="text-base tracking-wide text-white/80">{dialogDescription}</Typography>
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
