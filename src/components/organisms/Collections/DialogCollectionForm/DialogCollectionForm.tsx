'use client';

import { type ReactNode } from 'react';
import { Grip, Image as ImageIcon, Rows4, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { FORM_LABEL_CLASSES } from '@/config/forms';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH, COLLECTION_NAME_MAX_CHARACTER_LENGTH } from '@/config/posts';
import type { UseCoverImagePickerResult } from '@/hooks/useCoverImagePicker/useCoverImagePicker';
import {
  CREATE_COLLECTION_FORM_FIELDS,
  type CreateCollectionFormData,
} from '@/hooks/useCreateCollection/useCreateCollection.types';
import { cn } from '@/libs/utils/utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';

/** Truncates long placeholder/value text with an ellipsis (matches Figma dashed inputs). */
const COLLECTION_FORM_INPUT_WRAPPER_CLASS = 'mb-0 min-w-0 overflow-hidden';
const COLLECTION_FORM_INPUT_CLASS =
  'min-w-0 truncate placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap';

type DialogCollectionFormProps = {
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header title (`t('title')`). */
  title: string;
  /** Submit button label when idle (`t('save')`). */
  submitLabel: string;
  /** Label above the Grid/List selector. */
  layoutLabel: string;
  /** RHF form + cover picker from a `use{Create,Edit}Collection` hook. */
  form: UseFormReturn<CreateCollectionFormData>;
  cover: UseCoverImagePickerResult;
  /** Invoked when the user clicks the primary submit button. */
  onSubmit: () => void | Promise<void>;
  /**
   * Whether the dialog is currently saving. Owned by the wrapper so it can
   * flip synchronously on click (via `flushSync`) — RHF's `formState.isSubmitting`
   * is otherwise batched until the next microtask yield, which makes the
   * "Saving..." state appear late when the controller call starts with heavy
   * synchronous work (e.g. canvas-based cover image sanitization).
   */
  isSaving: boolean;
  /**
   * Whether the dialog is waiting for upstream data (e.g. the edit dialog's
   * `usePostDetails` resolving the envelope). When `true`, inputs and the
   * picker are disabled so the user can't type into fields that are about to
   * be overwritten by the prefill. The save button is already gated by an
   * empty name, so it stays disabled implicitly. Defaults to `false`.
   */
  isLoading?: boolean;
  /**
   * Unique id/htmlFor for the hidden cover file input. Distinct per caller so
   * create and edit dialogs don't collide if both mount at once.
   */
  coverInputId: string;
  /**
   * When `true`, suppresses Radix's open-autofocus so the (prefilled) title
   * input isn't highlighted with a focus ring on edit. Default is `false` so
   * the create dialog keeps its "land in the title field ready to type" UX.
   */
  disableOpenAutoFocus?: boolean;
  /** Optional trigger element; when present the dialog opens from it. */
  children?: ReactNode;
};

/**
 * Presentational shell for the collection create / edit dialog. Wraps the
 * shared form fields, cover-image picker, and footer actions so the two flows
 * can reuse the same DOM and styling. All copy and submit behavior come from
 * the caller (which owns the hook driving `form`, `cover`, and `onSubmit`).
 */
export function DialogCollectionForm({
  open,
  onOpenChange,
  title,
  submitLabel,
  layoutLabel,
  form,
  cover,
  onSubmit,
  isSaving,
  isLoading = false,
  coverInputId,
  disableOpenAutoFocus = false,
  children,
}: DialogCollectionFormProps) {
  const t = useTranslations('collections.new');
  const {
    previewUrl: coverPreviewUrl,
    error: coverError,
    inputRef: coverInputRef,
    onInputChange: onCoverInputChange,
    choose: chooseCover,
    remove: removeCover,
  } = cover;

  const watchedName = useWatch({ control: form.control, name: CREATE_COLLECTION_FORM_FIELDS.NAME });
  const areInputsDisabled = isSaving || isLoading;
  // Block submit while a cover-picker error is showing — the rejected file
  // never made it into form state, so saving would commit unchanged content
  // while the user is still staring at a validation error.
  const canSubmit = !!watchedName.trim() && !areInputsDisabled && !coverError;
  const layoutOptions = [
    { value: COLLECTION_LAYOUT.GRID, label: t('layoutGrid'), icon: Grip },
    { value: COLLECTION_LAYOUT.LIST, label: t('layoutList'), icon: Rows4 },
  ];

  const coverErrorMessage =
    coverError === 'invalid-type'
      ? t('coverImageInvalid')
      : coverError === 'too-large'
        ? t('coverImageTooLarge', { maxSize: `${Math.round(IMAGE_MAX_RAW_SIZE / (1024 * 1024))}MB` })
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        className="w-xl border-border bg-popover"
        onOpenAutoFocus={disableOpenAutoFocus ? (event) => event.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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
            disabled={areInputsDisabled}
            className={COLLECTION_FORM_INPUT_WRAPPER_CLASS}
            inputClassName={COLLECTION_FORM_INPUT_CLASS}
            dataCy="collection-form-name-input"
          />

          <ControlledInputField
            name={CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION}
            control={form.control}
            label={t('descriptionLabel')}
            placeholder={t('descriptionPlaceholder')}
            maxLength={COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH}
            variant="dashed"
            size="lg"
            disabled={areInputsDisabled}
            className={COLLECTION_FORM_INPUT_WRAPPER_CLASS}
            inputClassName={COLLECTION_FORM_INPUT_CLASS}
            dataCy="collection-form-description-input"
          />

          <Container overrideDefaults className="flex flex-col gap-2">
            <Label id="collection-layout-label" className={FORM_LABEL_CLASSES}>
              {layoutLabel}
            </Label>
            <Controller
              name={CREATE_COLLECTION_FORM_FIELDS.LAYOUT}
              control={form.control}
              render={({ field }) => (
                <Container
                  overrideDefaults
                  role="radiogroup"
                  aria-labelledby="collection-layout-label"
                  className="flex w-full border-b border-border"
                >
                  {layoutOptions.map(({ value, label, icon: Icon }) => {
                    const selected = field.value === value;

                    return (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        role="radio"
                        aria-checked={selected}
                        aria-label={label}
                        disabled={areInputsDisabled}
                        onClick={() => field.onChange(value)}
                        className={cn(
                          '-mb-px h-12 flex-1 rounded-none !border-x-0 !border-t-0 !border-b !border-solid bg-transparent shadow-none',
                          selected ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground',
                        )}
                        data-cy={`collection-layout-${value}`}
                      >
                        <Icon className="size-5" />
                      </Button>
                    );
                  })}
                </Container>
              )}
            />
          </Container>

          <Container overrideDefaults className="flex flex-col gap-2">
            <Label htmlFor={coverInputId} className={FORM_LABEL_CLASSES}>
              {t('backgroundLabel')}
            </Label>
            <Container
              overrideDefaults
              className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-md bg-card bg-cover bg-center"
              style={coverPreviewUrl ? { backgroundImage: `url(${coverPreviewUrl})` } : undefined}
              data-testid={coverInputId}
            >
              {coverPreviewUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={removeCover}
                  disabled={areInputsDisabled}
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
                  disabled={areInputsDisabled}
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
                id={coverInputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onCoverInputChange}
                disabled={areInputsDisabled}
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
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="order-1 sm:order-2"
            data-cy="collection-form-save-btn"
          >
            {isSaving ? t('saving') : submitLabel}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="order-2 sm:order-1"
          >
            {t('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
