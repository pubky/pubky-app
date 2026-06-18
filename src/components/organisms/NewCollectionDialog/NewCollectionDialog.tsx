'use client';

import { type ReactNode, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getCollectionRoute } from '@/app/routes';
import { useCreateCollection } from '@/hooks/useCreateCollection/useCreateCollection';
import { parseCompositeId } from '@/models/models.utils';
import { CollectionFormDialog } from '@/organisms/Collections/CollectionFormDialog/CollectionFormDialog';

type NewCollectionDialogProps = {
  children: ReactNode;
};

export function NewCollectionDialog({ children }: NewCollectionDialogProps) {
  const t = useTranslations('collections.new');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Local saving flag, flipped synchronously via `flushSync` so the "Saving..."
  // state paints before any heavy work (e.g. cover image canvas re-encoding)
  // begins. RHF's own `formState.isSubmitting` would otherwise be batched.
  const [isSavingLocal, setIsSavingLocal] = useState(false);

  const { form, cover, submit, reset } = useCreateCollection();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const handleSave = async () => {
    flushSync(() => setIsSavingLocal(true));
    try {
      const compositeId = await submit();
      if (!compositeId) return;
      handleOpenChange(false);
      const { pubky, id } = parseCompositeId(compositeId);
      router.push(getCollectionRoute(pubky, id));
    } finally {
      setIsSavingLocal(false);
    }
  };

  const isSaving = isSavingLocal || form.formState.isSubmitting;

  return (
    <CollectionFormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('title')}
      submitLabel={t('save')}
      form={form}
      cover={cover}
      onSubmit={handleSave}
      isSaving={isSaving}
      coverInputId="new-collection-cover-image"
    >
      {children}
    </CollectionFormDialog>
  );
}
