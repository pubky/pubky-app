'use client';

import { type ReactNode, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Slot } from 'radix-ui';
import { getCollectionRoute } from '@/app/routes';
import { useAuthoredCollections } from '@/hooks/useAuthoredCollections/useAuthoredCollections';
import { useCreateCollection } from '@/hooks/useCreateCollection/useCreateCollection';
import { parseCompositeId } from '@/models/models.utils';
import { DialogCollectionForm } from '@/organisms/Collections/DialogCollectionForm/DialogCollectionForm';
import { DialogCollectionsIntro } from '@/organisms/Collections/DialogCollectionsIntro/DialogCollectionsIntro';

type DialogNewCollectionProps = {
  /** Optional trigger element. Omit when driving the dialog via `open`/`onOpenChange`. */
  children?: ReactNode;
  /** Controlled open state (e.g. when opened by the FAB). Uncontrolled when omitted. */
  open?: boolean;
  /** Controlled open-change handler, paired with `open`. */
  onOpenChange?: (open: boolean) => void;
};

export function DialogNewCollection({
  children,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: DialogNewCollectionProps) {
  const t = useTranslations('collections.new');
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;

  // First-collection onboarding: users with no collections of their own see an
  // intro before the form. Bookmarks is a separate default feed (not an authored
  // collection), so it never counts here. `continued` records that the user
  // advanced past the intro, keeping the form mounted for the rest of the open
  // session even after the optimistic create flips the count to 1.
  const { collections, isLoading } = useAuthoredCollections();
  const [continued, setContinued] = useState(false);
  const needsIntro = !isLoading && collections.length === 0;
  const introOpen = open && !isLoading && needsIntro && !continued;
  const formOpen = open && !isLoading && (!needsIntro || continued);

  // Local saving flag, flipped synchronously via `flushSync` so the "Saving..."
  // state paints before any heavy work (e.g. cover image canvas re-encoding)
  // begins. RHF's own `formState.isSubmitting` would otherwise be batched.
  const [isSavingLocal, setIsSavingLocal] = useState(false);

  const { form, cover, submit, reset } = useCreateCollection();

  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) setOpenState(nextOpen);
    onOpenChangeProp?.(nextOpen);
  };

  const closeFlow = () => {
    setOpen(false);
    setContinued(false);
    reset();
  };

  // Close handlers only ever fire on dismissal — the intro's Continue advances
  // the flow through `onContinue`, not by toggling open.
  const handleDismiss = (nextOpen: boolean) => {
    if (!nextOpen) closeFlow();
  };

  const handleSave = async () => {
    flushSync(() => setIsSavingLocal(true));
    try {
      const compositeId = await submit();
      if (!compositeId) return;
      closeFlow();
      const { pubky, id } = parseCompositeId(compositeId);
      router.push(getCollectionRoute(pubky, id));
    } finally {
      setIsSavingLocal(false);
    }
  };

  const isSaving = isSavingLocal || form.formState.isSubmitting;

  return (
    <>
      {children ? <Slot.Root onClick={() => setOpen(true)}>{children}</Slot.Root> : null}

      <DialogCollectionsIntro open={introOpen} onOpenChange={handleDismiss} onContinue={() => setContinued(true)} />

      <DialogCollectionForm
        open={formOpen}
        onOpenChange={handleDismiss}
        title={t('title')}
        submitLabel={t('save')}
        layoutLabel={t('layoutLabel')}
        form={form}
        cover={cover}
        onSubmit={handleSave}
        isSaving={isSaving}
        coverInputId="new-collection-cover-image"
      />
    </>
  );
}
