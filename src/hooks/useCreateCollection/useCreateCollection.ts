'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { PostController } from '@/controllers/post/post';
import { useCoverImagePicker, type UseCoverImagePickerResult } from '@/hooks/useCoverImagePicker/useCoverImagePicker';
import { isAppError } from '@/libs/error/error.utils';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import {
  CREATE_COLLECTION_FORM_FIELDS,
  type CreateCollectionFormData,
  createCollectionFormDefaults,
  createCollectionFormSchema,
} from './useCreateCollection.types';

type UseCreateCollectionResult = {
  /** React Hook Form instance — wire to `ControlledInputField` via `form.control`. */
  form: UseFormReturn<CreateCollectionFormData>;
  /** Cover image picker — file/preview/error state plus handlers. */
  cover: UseCoverImagePickerResult;
  /**
   * Validate + commit the collection. Returns the new collection's composite
   * id (`author:postId`) on success, or `null` otherwise (validation rejected
   * the form, or the controller threw). Uses RHF's `handleSubmit` so field-level
   * errors surface in the UI. The id lets the caller navigate to the created
   * collection's route.
   */
  submit: () => Promise<string | null>;
  /** Clear the form fields and the cover picker. */
  reset: () => void;
};

/**
 * Encapsulates the "create collection" form on top of react-hook-form + zod.
 *
 * - Schema lives in `./useCreateCollection.types.ts`
 * - Cover image is managed by `useCoverImagePicker` (separate concern: file
 *   pickers don't fit RHF's `register`/`Controller` model cleanly because of
 *   blob URL lifecycle and image-specific validation)
 * - Validation mode is `all`: required feedback appears after blur and clears
 *   as the user edits a valid value.
 * - `submit()` returns the new collection's composite id (`Promise<string |
 *   null>`) so the caller can decide what to do on success (close dialog,
 *   navigate to the collection, etc.)
 */
export function useCreateCollection(): UseCreateCollectionResult {
  const t = useTranslations('collections.new');
  const tFile = useTranslations('toast.file');
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { toast } = useToast();
  const cover = useCoverImagePicker();

  const form = useForm<CreateCollectionFormData>({
    resolver: zodResolver(createCollectionFormSchema(t)),
    defaultValues: createCollectionFormDefaults,
    // `onChange` (not `all`): we deliberately skip blur-triggered validation so
    // clicking the dialog's X button on an untouched empty title doesn't fire
    // the required-field error, grow the dialog, and shift the X button out
    // from under the user's mouseup. The user still gets feedback as soon as
    // they type and erase a value.
    mode: 'onChange',
  });

  const submit = async (): Promise<string | null> => {
    if (!currentUserPubky) return null;

    let createdCollectionId: string | null = null;
    await form.handleSubmit(async (data) => {
      const name = data[CREATE_COLLECTION_FORM_FIELDS.NAME];
      const description = data[CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION];
      const layout = data[CREATE_COLLECTION_FORM_FIELDS.LAYOUT];
      try {
        const compositeId = await PostController.commitCreateCollection({
          authorId: currentUserPubky,
          name,
          description,
          coverImage: cover.file,
          layout,
        });
        // Mirror the post-attachment pattern: stash a blob URL so the cover
        // renders instantly while the homeserver / CDN catch up.
        if (cover.file) {
          const blobUrl = URL.createObjectURL(cover.file);
          useLocalFilesStore.getState().setCollectionCover(compositeId, blobUrl);
        }
        toast({
          title: t('created'),
        });
        createdCollectionId = compositeId;
      } catch (error) {
        Logger.error('[useCreateCollection] Failed to create collection', { error });
        toast({
          variant: 'error',
          description:
            getImageUploadSizeLimitToastMessage(error, tFile) ??
            (isAppError(error) ? error.message : t('createFailed')),
        });
      }
    })();
    return createdCollectionId;
  };

  const reset = () => {
    form.reset(createCollectionFormDefaults);
    cover.reset();
  };

  return {
    form,
    cover,
    submit,
    reset,
  };
}
