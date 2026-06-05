'use client';

import { type ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';
import { getCollectionRoute } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import { FORM_LABEL_CLASSES } from '@/config/forms';
import { COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH, COLLECTION_NAME_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useCreateCollection } from '@/hooks/useCreateCollection/useCreateCollection';
import { CREATE_COLLECTION_FORM_FIELDS } from '@/hooks/useCreateCollection/useCreateCollection.types';
import { parseCompositeId } from '@/models/models.utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';

type NewCollectionDialogProps = {
  children: ReactNode;
};

export function NewCollectionDialog({ children }: NewCollectionDialogProps) {
  const t = useTranslations('collections.new');
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { form, cover, submit, reset } = useCreateCollection();
  const {
    previewUrl: coverPreviewUrl,
    error: coverError,
    inputRef: coverInputRef,
    onInputChange: onCoverInputChange,
    choose: chooseCover,
    remove: removeCover,
  } = cover;

  const isSaving = form.formState.isSubmitting;
  const watchedName = useWatch({ control: form.control, name: CREATE_COLLECTION_FORM_FIELDS.NAME });
  const canSubmit = !!watchedName.trim() && !isSaving;

  const coverErrorMessage =
    coverError === 'invalid-type'
      ? t('coverImageInvalid')
      : coverError === 'too-large'
        ? t('coverImageTooLarge')
        : null;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const handleSave = async () => {
    const compositeId = await submit();
    if (!compositeId) return;
    handleOpenChange(false);
    const { pubky, id } = parseCompositeId(compositeId);
    router.push(getCollectionRoute(pubky, id));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-full max-w-xl border-border bg-popover">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <Container overrideDefaults className="flex flex-col gap-4">
          <ControlledInputField
            name={CREATE_COLLECTION_FORM_FIELDS.NAME}
            control={form.control}
            label={t('nameLabel')}
            placeholder={t('namePlaceholder')}
            maxLength={COLLECTION_NAME_MAX_CHARACTER_LENGTH}
            variant="dashed"
            size="lg"
            disabled={isSaving}
          />

          <ControlledInputField
            name={CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION}
            control={form.control}
            label={t('descriptionLabel')}
            placeholder={t('descriptionPlaceholder')}
            maxLength={COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH}
            variant="dashed"
            size="lg"
            disabled={isSaving}
          />

          <Container overrideDefaults className="flex flex-col gap-2">
            <Label htmlFor="new-collection-cover-image" className={FORM_LABEL_CLASSES}>
              {t('backgroundLabel')}
            </Label>
            <Container
              overrideDefaults
              className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-md bg-card bg-cover bg-center"
              style={coverPreviewUrl ? { backgroundImage: `url(${coverPreviewUrl})` } : undefined}
              data-testid="new-collection-cover-image"
            >
              {coverPreviewUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={removeCover}
                  disabled={isSaving}
                  aria-label={t('removeImage')}
                >
                  <Trash2 className="size-4" />
                  <Typography as="span" overrideDefaults>
                    {t('removeImage')}
                  </Typography>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={chooseCover}
                  disabled={isSaving}
                  aria-label={t('addImage')}
                >
                  <ImageIcon className="size-4" />
                  <Typography as="span" overrideDefaults>
                    {t('addImage')}
                  </Typography>
                </Button>
              )}
              <input
                ref={coverInputRef}
                id="new-collection-cover-image"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onCoverInputChange}
                disabled={isSaving}
              />
            </Container>
            {coverErrorMessage && (
              <Typography overrideDefaults className="text-sm font-medium text-destructive">
                {coverErrorMessage}
              </Typography>
            )}
          </Container>
        </Container>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            {t('cancel')}
          </Button>
          <Button size="lg" onClick={handleSave} disabled={!canSubmit}>
            {isSaving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
