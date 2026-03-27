'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

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
    <Atoms.Dialog open={open} onOpenChange={onOpenChange}>
      <Atoms.DialogContent className="w-xl" hiddenTitle={t('title')}>
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Atoms.Typography className="text-base tracking-wide text-white/80">{t('description')}</Atoms.Typography>
        <Atoms.DialogFooter>
          <Atoms.Button variant="destructive" size="lg" onClick={handleDelete}>
            <Libs.Trash2 className="h-4 w-4" />
            {t('confirmButton')}
          </Atoms.Button>
          <Atoms.Button variant="outline" size="lg" onClick={handleCancel}>
            {t('cancelButton')}
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
