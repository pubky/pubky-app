'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useEditCollection } from '@/hooks/useEditCollection/useEditCollection';
import { DialogCollectionForm } from '@/organisms/Collections/DialogCollectionForm/DialogCollectionForm';

type DialogEditCollectionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Composite collection id (`author:postId`) the dialog is editing. */
  compositeCollectionId: string;
};

export function DialogEditCollection({ open, onOpenChange, compositeCollectionId }: DialogEditCollectionProps) {
  const t = useTranslations('collections.edit');
  // Local saving flag, flipped synchronously via `flushSync` so the "Saving..."
  // state paints before any heavy work (e.g. cover image canvas re-encoding)
  // begins. RHF's own `formState.isSubmitting` would otherwise be batched.
  const [isSavingLocal, setIsSavingLocal] = useState(false);

  const { form, cover, isLoaded, submit, reset } = useEditCollection({ compositeCollectionId });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  };

  const handleSave = async () => {
    flushSync(() => setIsSavingLocal(true));
    try {
      const ok = await submit();
      if (!ok) return;
      handleOpenChange(false);
    } finally {
      setIsSavingLocal(false);
    }
  };

  const isSaving = isSavingLocal || form.formState.isSubmitting;

  return (
    <DialogCollectionForm
      open={open}
      onOpenChange={handleOpenChange}
      title={t('title')}
      submitLabel={t('save')}
      layoutLabel={t('defaultLayoutLabel')}
      form={form}
      cover={cover}
      onSubmit={handleSave}
      isSaving={isSaving}
      isLoading={!isLoaded}
      coverInputId="edit-collection-cover-image"
      disableOpenAutoFocus
    />
  );
}
